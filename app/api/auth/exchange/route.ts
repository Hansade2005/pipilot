import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider')
    const body = await request.json()
    const code = body.code

    if (!provider || !code) {
      return new Response(JSON.stringify({ error: 'Missing provider or code' }), { status: 400 })
    }

    if (provider === 'github') {
      // Exchange code for access token with GitHub
      const clientId = process.env.GITHUB_CLIENT_ID
      const clientSecret = process.env.GITHUB_CLIENT_SECRET
      if (!clientId || !clientSecret) {
        return new Response(JSON.stringify({ error: 'GitHub OAuth not configured' }), { status: 500 })
      }
      const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
      })

      const tokenJson = await tokenResp.json()
      const token = tokenJson.access_token

      if (!token) return new Response(JSON.stringify({ error: 'No token from GitHub' }), { status: 500 })

      // Optionally fetch user info
      const userResp = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${token}` }
      })
      const userJson = await userResp.json()
      const userId = userJson?.id ? String(userJson.id) : undefined

      return new Response(JSON.stringify({ token, userId }), { status: 200 })
    }

    if (provider === 'netlify') {
      // Netlify OAuth exchange
      const clientId = process.env.NETLIFY_CLIENT_ID
      const clientSecret = process.env.NETLIFY_CLIENT_SECRET
      const tokenResp = await fetch('https://api.netlify.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' })
      })

      const tokenJson = await tokenResp.json()
      const token = tokenJson.access_token || tokenJson.token
      if (!token) return new Response(JSON.stringify({ error: 'No token from Netlify' }), { status: 500 })

      // Try to get user info
      const userResp = await fetch('https://api.netlify.com/api/v1/user', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const userJson = await userResp.json()
      const userId = userJson?.id

      return new Response(JSON.stringify({ token, userId }), { status: 200 })
    }

    return new Response(JSON.stringify({ error: 'Unsupported provider' }), { status: 400 })
  } catch (error) {
    console.error('Exchange error', error)
    return new Response(JSON.stringify({ error: 'Exchange failed' }), { status: 500 })
  }
}
