import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN
    const kvNamespaceId = 'e3b571cde10d48e38fdb107e0b9e2911' // API_KEYS namespace

    if (!cloudflareAccountId || !cloudflareApiToken) {
      // Return free tier as default
      return NextResponse.json({ tier: 'free', status: 'active' })
    }

    // Fetch user's subscription from KV
    const subscriptionKey = `user:${user.id}:subscription`
    const url = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/storage/kv/namespaces/${kvNamespaceId}/values/${encodeURIComponent(subscriptionKey)}`

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${cloudflareApiToken}`,
      }
    })

    if (!response.ok) {
      // No subscription found, return free tier
      return NextResponse.json({ tier: 'free', status: 'active' })
    }

    const subscriptionText = await response.text()
    try {
      const subscription = JSON.parse(subscriptionText)
      return NextResponse.json(subscription)
    } catch (e) {
      return NextResponse.json({ tier: 'free', status: 'active' })
    }

  } catch (error: any) {
    console.error('Error fetching subscription:', error)
    return NextResponse.json(
      { tier: 'free', status: 'active' },
      { status: 200 } // Return free tier on error
    )
  }
}
