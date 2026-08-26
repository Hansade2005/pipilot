import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { createDatabaseBucket, getDatabaseBucket } from '@/lib/storage';

/**
 * POST /api/database/fix-storage
 * Fix databases that don't have storage buckets initialized
 * This endpoint initializes storage buckets for existing databases
 * Requires authentication — admin-level operation.
 */
export async function POST(request: Request) {
    try {
        // Require authentication
        const authSupabase = await createClient();
        const { data: { user }, error: authError } = await authSupabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const supabase = createAdminClient();

        // Get all databases
        const { data: databases, error: dbError } = await supabase
            .from('databases')
            .select('*');

        if (dbError) {
            console.error('Error fetching databases:', dbError);
            return NextResponse.json(
                { error: 'Failed to fetch databases' },
                { status: 500 }
            );
        }

        const results = {
            total: databases?.length || 0,
            fixed: 0,
            skipped: 0,
            errors: [] as any[],
        };

        // Check and create storage buckets for each database
        for (const database of databases || []) {
            try {
                // Check if bucket already exists
                const existingBucket = await getDatabaseBucket(database.id);

                if (existingBucket) {
                    console.log(`Database ${database.id} already has a storage bucket`);
                    results.skipped++;
                    continue;
                }

                // Create storage bucket
                const bucket = await createDatabaseBucket(database.id, database.name);
                console.log(`Created storage bucket for database ${database.id}:`, bucket);
                results.fixed++;

            } catch (error: any) {
                console.error(`Error fixing database ${database.id}:`, error);
                results.errors.push({
                    database_id: database.id,
                    database_name: database.name,
                    error: error.message,
                });
            }
        }

        return NextResponse.json({
            success: true,
            results,
            message: `Fixed ${results.fixed} databases, skipped ${results.skipped}, ${results.errors.length} errors`,
        });

    } catch (error: any) {
        console.error('Unexpected error in fix-storage:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
