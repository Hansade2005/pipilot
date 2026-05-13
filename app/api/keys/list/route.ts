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
      return NextResponse.json({ error: 'Cloudflare credentials not configured' }, { status: 500 })
    }

    // Fetch user's keys list from KV
    const userKeysKey = `user:${user.id}:keys`
    const userKeysUrl = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/storage/kv/namespaces/${kvNamespaceId}/values/${encodeURIComponent(userKeysKey)}`

    const keysListResponse = await fetch(userKeysUrl, {
      headers: {
        'Authorization': `Bearer ${cloudflareApiToken}`,
      }
    })

    if (!keysListResponse.ok) {
      // No keys yet
      return NextResponse.json({ keys: [] })
    }

    const keysListText = await keysListResponse.text()
    let keysList: string[] = []
    try {
      keysList = JSON.parse(keysListText)
    } catch (e) {
      return NextResponse.json({ keys: [] })
    }

    // Fetch full data for each key
    const keysData = await Promise.all(
      keysList.map(async (apiKey) => {
        const keyUrl = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/storage/kv/namespaces/${kvNamespaceId}/values/${encodeURIComponent(apiKey)}`

        const response = await fetch(keyUrl, {
          headers: {
            'Authorization': `Bearer ${cloudflareApiToken}`,
          }
        })

        if (!response.ok) {
          return null
        }

        const keyDataText = await response.text()
        try {
          const keyData = JSON.parse(keyDataText)

          // Only return non-revoked keys
          if (keyData.revoked) {
            return null
          }

          return {
            id: keyData.id || apiKey,
            name: keyData.name,
            key: apiKey, // Will be hidden in UI
            key_prefix: apiKey.substring(0, 12),
            created_at: keyData.createdAt,
            last_used_at: keyData.lastUsedAt,
            requests_count: keyData.totalRequests || 0,
            tier: keyData.tier
          }
        } catch (e) {
          return null
        }
      })
    )

    // Filter out nulls and return
    const validKeys = keysData.filter(k => k !== null)

    return NextResponse.json({ keys: validKeys })

  } catch (error: any) {
    console.error('Error listing API keys:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
