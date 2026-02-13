// ==========================================================
// BROWSER AUTOMATION TOOL — PLAYWRIGHT IN E2B SANDBOX
// ==========================================================
// Purpose: Run Playwright scripts in a secure E2B sandbox to
// navigate websites, take screenshots, test web apps, and
// interact with web pages. Screenshots are uploaded to Supabase.
// ==========================================================

import { Sandbox } from "@e2b/code-interpreter";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

// Supabase configuration for screenshot storage
const SUPABASE_CONFIG = {
  URL: "https://dlunpilhklsgvkegnnlp.supabase.co",
  ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdW5waWxoa2xzZ3ZrZWdubmxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwNTA0MTksImV4cCI6MjA3MDYyNjQxOX0.rhLN_bhvH9IWPkyHiohrOQbY9D34RSeSLzURhAyZPds",
  SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdW5waWxoa2xzZ3ZrZWdubmxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA1MDQxOSwiZXhwIjoyMDcwNjI2NDE5fQ.k-2OJ4p3hr9feR4ks54OQM2HhOhaVJ3pUK-20tGJwpo",
};

const supabase = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.SERVICE_ROLE_KEY);

const sandboxTimeout = 3 * 60 * 1000; // 3 minutes
export const maxDuration = 120; // 2 minutes for Vercel

export async function POST(req: NextRequest) {
  try {
    // --------------------------
    // EXTRACT PARAMETERS
    // --------------------------
    const body = await req.json();
    const { script, timeoutSeconds = 60 } = body;

    if (!script) {
      return NextResponse.json(
        { error: "No Playwright script provided" },
        { status: 400 }
      );
    }

    // --------------------------
    // VALIDATE E2B API KEY
    // --------------------------
    if (!process.env.E2B_API_KEY) {
      return NextResponse.json(
        { error: "E2B_API_KEY environment variable not configured" },
        { status: 500 }
      );
    }

    // --------------------------
    // CREATE PLAYWRIGHT SANDBOX
    // --------------------------
    console.log('[browse_web] Creating Playwright sandbox...');
    const sandbox = await Sandbox.create('playwright-chromium', {
      apiKey: process.env.E2B_API_KEY,
      timeoutMs: sandboxTimeout,
    });
    console.log(`[browse_web] Sandbox created: ${sandbox.sandboxId}`);

    // --------------------------
    // WRITE PLAYWRIGHT SCRIPT
    // --------------------------
    // Wrap the user script to ensure proper imports and error handling
    const wrappedScript = `
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Collect console logs
  const consoleLogs = [];
  page.on('console', (msg) => {
    consoleLogs.push(\`[\${msg.type()}] \${msg.text()}\`);
  });

  // Collect page errors
  const pageErrors = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  // Collect network failures
  const networkErrors = [];
  page.on('requestfailed', (request) => {
    networkErrors.push(\`\${request.method()} \${request.url()} - \${request.failure()?.errorText || 'unknown error'}\`);
  });

  try {
    // User script starts here
    ${script}
    // User script ends here
  } catch (error) {
    console.error('Script error:', error.message);
    // Take error screenshot
    await page.screenshot({ path: '/home/user/error_screenshot.png', fullPage: true }).catch(() => {});
  } finally {
    // Output collected data as JSON for parsing
    const output = {
      consoleLogs,
      pageErrors,
      networkErrors,
      currentUrl: page.url(),
      title: await page.title().catch(() => 'unknown')
    };
    console.log('__PLAYWRIGHT_OUTPUT__' + JSON.stringify(output));
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
`;

    await sandbox.files.write('/app/script.mjs', wrappedScript);
    console.log('[browse_web] Script written to sandbox');

    // --------------------------
    // EXECUTE PLAYWRIGHT SCRIPT
    // --------------------------
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    console.log('[browse_web] Executing Playwright script...');
    const result = await sandbox.commands.run(
      'PLAYWRIGHT_BROWSERS_PATH=0 node script.mjs',
      {
        cwd: '/app',
        timeoutMs: timeoutSeconds * 1000,
        onStdout: (msg: string) => {
          stdoutLines.push(msg);
          console.log('[browse_web stdout]', msg);
        },
        onStderr: (msg: string) => {
          stderrLines.push(msg);
          console.log('[browse_web stderr]', msg);
        },
      }
    );

    const stdout = stdoutLines.join('\n');
    const stderr = stderrLines.join('\n');

    console.log(`[browse_web] Script completed with exit code: ${result.exitCode}`);

    // --------------------------
    // PARSE PLAYWRIGHT OUTPUT
    // --------------------------
    let playwrightOutput: {
      consoleLogs: string[];
      pageErrors: string[];
      networkErrors: string[];
      currentUrl: string;
      title: string;
    } = {
      consoleLogs: [],
      pageErrors: [],
      networkErrors: [],
      currentUrl: '',
      title: ''
    };

    // Extract the JSON output from stdout
    const outputMatch = stdout.match(/__PLAYWRIGHT_OUTPUT__(.+)/);
    if (outputMatch) {
      try {
        playwrightOutput = JSON.parse(outputMatch[1]);
      } catch (e) {
        console.warn('[browse_web] Failed to parse Playwright output JSON');
      }
    }

    // --------------------------
    // READ SCREENSHOTS FROM SANDBOX
    // --------------------------
    const screenshots: Record<string, string> = {};
    const uploadResults: Array<{ fileName: string; success: boolean; url?: string; error?: string }> = [];

    try {
      const files = await sandbox.files.list('/home/user/');
      const imageFiles = files.filter(
        (file: any) =>
          file.type === 'file' &&
          !file.name.startsWith('.') &&
          (file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg'))
      );

      console.log(`[browse_web] Found ${imageFiles.length} screenshot(s) to upload`);

      for (const file of imageFiles) {
        try {
          // Read binary content from sandbox
          const content = await sandbox.files.read(file.path, { format: 'bytes' });

          // Generate unique file path for Supabase storage
          const timestamp = Date.now();
          const randomId = Math.random().toString(36).substring(2, 15);
          const fileName = `browser_${timestamp}_${randomId}_${file.name}`;

          // Upload to Supabase documents bucket
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('documents')
            .upload(fileName, content, {
              cacheControl: '3600',
              upsert: false,
              contentType: file.name.endsWith('.png') ? 'image/png' : 'image/jpeg',
            });

          if (uploadError) {
            console.error(`[browse_web] Failed to upload ${file.name}:`, uploadError);
            uploadResults.push({
              fileName: file.name,
              success: false,
              error: uploadError.message,
            });
            continue;
          }

          // Generate public download URL
          const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(fileName);

          const publicUrl = urlData.publicUrl;

          // Record file metadata in database for cleanup tracking
          const fileMetadata = {
            file_name: fileName,
            original_name: file.name,
            bucket_name: 'documents',
            file_size: typeof content === 'object' && 'byteLength' in content ? content.byteLength : 0,
            mime_type: file.name.endsWith('.png') ? 'image/png' : 'image/jpeg',
            public_url: publicUrl,
            uploaded_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
            created_by: 'browse_web_api',
          };

          const { error: dbError } = await supabaseAdmin
            .from('temp_file_uploads')
            .insert(fileMetadata);

          if (dbError) {
            console.error(`[browse_web] Failed to record file metadata:`, dbError);
          }

          screenshots[file.name] = publicUrl;
          uploadResults.push({
            fileName: file.name,
            success: true,
            url: publicUrl,
          });

          console.log(`[browse_web] Uploaded ${file.name}: ${publicUrl}`);
        } catch (fileError) {
          console.error(`[browse_web] Failed to process ${file.name}:`, fileError);
          uploadResults.push({
            fileName: file.name,
            success: false,
            error: fileError instanceof Error ? fileError.message : 'Unknown error',
          });
        }
      }
    } catch (listError) {
      console.error('[browse_web] Failed to list files:', listError);
    }

    // --------------------------
    // SCHEDULE FILE CLEANUP
    // --------------------------
    if (Object.keys(screenshots).length > 0) {
      try {
        await fetch('https://dlunpilhklsgvkegnnlp.supabase.co/functions/v1/hyper-worker', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_CONFIG.SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            action: 'schedule_cleanup',
            delay_minutes: 10,
            bucket_name: 'documents',
          }),
        });
      } catch (cleanupError) {
        console.error('[browse_web] Failed to schedule cleanup:', cleanupError);
      }
    }

    // --------------------------
    // CLEANUP SANDBOX
    // --------------------------
    try {
      await sandbox.kill();
    } catch (killError) {
      console.warn('[browse_web] Failed to kill sandbox:', killError);
    }

    // --------------------------
    // RETURN RESULTS
    // --------------------------
    return NextResponse.json({
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: stdout.replace(/__PLAYWRIGHT_OUTPUT__.+/, '').trim(),
      stderr,
      screenshots,
      uploadResults,
      browserData: playwrightOutput,
    });
  } catch (error) {
    console.error('[browse_web] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
