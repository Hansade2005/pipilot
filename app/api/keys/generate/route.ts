import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, tier = 'free' } = body

    if (!name) {
      return NextResponse.json({ error: 'Key name is required' }, { status: 400 })
    }

    // Generate secure API key
    const prefix = tier === 'free' ? 'pk_test_' : 'pk_live_'
    const randomBytes = crypto.randomBytes(24).toString('hex')
    const apiKey = prefix + randomBytes
    const keyId = crypto.randomUUID()

    // Cloudflare KV credentials
    const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN
    const kvNamespaceId = 'e3b571cde10d48e38fdb107e0b9e2911' // API_KEYS namespace

    if (!cloudflareAccountId || !cloudflareApiToken) {
      return NextResponse.json({ error: 'Cloudflare credentials not configured' }, { status: 500 })
    }

    // Store API key in KV
    const keyData = {
      id: keyId,
      name,
      tier,
      userId: user.id,
      userEmail: user.email,
      createdAt: new Date().toISOString(),
      totalRequests: 0,
      lastUsedAt: null,
      revoked: false,
      rateLimit: tier === 'free' ? 1000 : tier === 'starter' ? 5000 : tier === 'pro' ? 10000 : 50000
    }

    // Store key data with key as KV key
    const keyKvUrl = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/storage/kv/namespaces/${kvNamespaceId}/values/${encodeURIComponent(apiKey)}`

    const keyResponse = await fetch(keyKvUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${cloudflareApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(keyData)
    })

    if (!keyResponse.ok) {
      const error = await keyResponse.text()
      console.error('Error storing API key in KV:', error)
      return NextResponse.json({ error: 'Failed to store API key' }, { status: 500 })
    }

    // Store key reference in user's key list
    const userKeysKey = `user:${user.id}:keys`
    const userKeysUrl = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/storage/kv/namespaces/${kvNamespaceId}/values/${encodeURIComponent(userKeysKey)}`

    // Fetch existing keys list
    const existingKeysResponse = await fetch(userKeysUrl, {
      headers: {
        'Authorization': `Bearer ${cloudflareApiToken}`,
      }
    })

    let keysList: string[] = []
    if (existingKeysResponse.ok) {
      const data = await existingKeysResponse.text()
      try {
        keysList = JSON.parse(data)
      } catch (e) {
        keysList = []
      }
    }

    // Add new key ID
    keysList.push(apiKey)

    // Store updated keys list
    await fetch(userKeysUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${cloudflareApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(keysList)
    })

    return NextResponse.json({ apiKey, keyId, name })

  } catch (error: any) {
    console.error('Error generating API key:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
