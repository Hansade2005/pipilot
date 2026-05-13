import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { keyId } = body // This is the actual API key, not an ID

    if (!keyId) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 })
    }

    const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN
    const kvNamespaceId = 'e3b571cde10d48e38fdb107e0b9e2911' // API_KEYS namespace

    if (!cloudflareAccountId || !cloudflareApiToken) {
      return NextResponse.json({ error: 'Cloudflare credentials not configured' }, { status: 500 })
    }

    // Fetch the key data from KV
    const keyUrl = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/storage/kv/namespaces/${kvNamespaceId}/values/${encodeURIComponent(keyId)}`

    const keyResponse = await fetch(keyUrl, {
      headers: {
        'Authorization': `Bearer ${cloudflareApiToken}`,
      }
    })

    if (!keyResponse.ok) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    const keyDataText = await keyResponse.text()
    let keyData
    try {
      keyData = JSON.parse(keyDataText)
    } catch (e) {
      return NextResponse.json({ error: 'Invalid key data' }, { status: 500 })
    }

    // Verify ownership
    if (keyData.userId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Mark as revoked
    keyData.revoked = true
    keyData.revokedAt = new Date().toISOString()

    // Update in KV
    const updateResponse = await fetch(keyUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${cloudflareApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(keyData)
    })

    if (!updateResponse.ok) {
      return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Error revoking API key:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
