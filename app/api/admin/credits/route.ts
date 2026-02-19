import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@/lib/supabase/server"
import { checkAdminAccess } from '@/lib/admin-utils'
import { createClient as createAdminClient } from "@supabase/supabase-js"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!checkAdminAccess(user)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    // Fetch all user wallets with profile info
    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: wallets, error: walletsError } = await adminSupabase
      .from('wallet')
      .select(`
        id,
        user_id,
        credits_balance,
        credits_used_this_month,
        credits_used_total,
        current_plan,
        subscription_status,
        created_at,
        updated_at
      `)
      .order('updated_at', { ascending: false })

    if (walletsError) {
      console.error('Error fetching wallets:', walletsError)
      return NextResponse.json({
        error: "Failed to fetch wallets",
        details: walletsError.message
      }, { status: 500 })
    }

    // Add profile data to each wallet
    const walletsWithProfiles = await Promise.all(
      (wallets || []).map(async (wallet) => {
        const { data: profile, error: profileError } = await adminSupabase
          .from('profiles')
          .select('email, full_name, avatar_url')
          .eq('id', wallet.user_id)
          .single()

        if (profileError) {
          console.error('Error fetching profile for wallet:', wallet.id, profileError)
          return null
        }

        // Get recent transactions for this user
        const { count: totalTransactions } = await adminSupabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', wallet.user_id)

        const { data: recentTransactions } = await adminSupabase
          .from('transactions')
          .select('id, amount, type, description, created_at')
          .eq('user_id', wallet.user_id)
          .order('created_at', { ascending: false })
          .limit(5)

        // Check if user has any BYOK usage (request_type contains 'byok')
        const { count: byokUsageCount } = await adminSupabase
          .from('usage_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', wallet.user_id)
          .like('request_type', '%byok%')

        return {
          id: wallet.id,
          user_id: wallet.user_id,
          credits_balance: wallet.credits_balance,
          credits_used_this_month: wallet.credits_used_this_month,
          credits_used_total: wallet.credits_used_total,
          current_plan: wallet.current_plan,
          subscription_status: wallet.subscription_status,
          created_at: wallet.created_at,
          updated_at: wallet.updated_at,
          profile: profile,
          transactions: {
            total: totalTransactions || 0,
            recent: recentTransactions || []
          },
          byok: {
            hasUsed: (byokUsageCount || 0) > 0,
            requestCount: byokUsageCount || 0
          }
        }
      })
    )

    const validWallets = walletsWithProfiles.filter(wallet => wallet !== null)

    // Calculate stats
    const totalUsers = validWallets.length
    const totalCredits = validWallets.reduce((sum, wallet) => sum + wallet.credits_balance, 0)
    const averageCredits = totalUsers > 0 ? totalCredits / totalUsers : 0
    const activeWallets = validWallets.filter(wallet => wallet.credits_balance > 0).length

    return NextResponse.json({
      wallets: validWallets,
      stats: {
        totalUsers,
        totalCredits,
        averageCredits,
        activeWallets
      }
    })

  } catch (error) {
    console.error('Error in admin credits API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}