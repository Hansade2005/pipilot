// Smoke-test the pipilot-video template end-to-end: create a sandbox, seed a
// Pixabay-free / screencast-free storyboard (so it needs no extra keys — it
// exercises title/credits cards via Chromium, Ken Burns stills from Unsplash,
// Jamendo music, and the full ffmpeg xfade/concat/mux path), render, and pull
// the MP4 back to ./video.mp4. Reads E2B_API_KEY from the env.
import { Sandbox } from 'e2b'
import fs from 'node:fs'

const storyboard = {
  title: 'PiPilot Video',
  aspect: '16:9',
  music: { mood: 'inspiring' },
  scenes: [
    { kind: 'title', dur: 3.5, title: 'PiPilot Video', sub: 'generated from a script' },
    { kind: 'still', dur: 3.4, topic: 'Technology', forward: true },
    { kind: 'still', dur: 3.4, keyword: 'city skyline', forward: false },
    { kind: 'still', dur: 3.4, topic: 'Nature', forward: true },
    { kind: 'credits', dur: 3 },
  ],
}

const sbx = await Sandbox.create('pipilot-video', { timeoutMs: 300_000 })
console.log('sandbox:', sbx.sandboxId)
try {
  await sbx.files.write('/home/user/sb.json', JSON.stringify(storyboard))
  const r = await sbx.commands.run(
    "bash -lc 'cd /opt/pipilot-video && node generate.mjs /home/user/sb.json'",
    { timeoutMs: 280_000 },
  ).catch((e) => ({ stdout: e?.stdout || '', stderr: e?.stderr || String(e?.message || e), exitCode: e?.exitCode ?? 1 }))
  console.log('--- render stdout ---\n' + (r.stdout || '(none)'))
  if (r.stderr) console.log('--- stderr ---\n' + r.stderr)
  if ((r.exitCode ?? 1) !== 0) { console.error('render exited', r.exitCode); process.exit(1) }
  const bytes = await sbx.files.read('/opt/pipilot-video/out/video.mp4', { format: 'bytes' })
  fs.writeFileSync('video.mp4', Buffer.from(bytes))
  console.log(`✅ wrote video.mp4 — ${(bytes.length / 1048576).toFixed(2)} MB`)
} finally {
  await sbx.kill().catch(() => {})
}
