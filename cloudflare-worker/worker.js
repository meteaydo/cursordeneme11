const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const path = url.pathname

    try {
      // 1. Dosya Okuma (GET)
      if (request.method === 'GET' && path !== '/' && path !== '/presign' && path !== '/delete' && path !== '/upload') {
        const key = path.slice(1)
        const object = await env.R2_BUCKET.get(key)
        if (!object) return new Response('Not found', { status: 404, headers: CORS_HEADERS })
        
        const headers = new Headers(CORS_HEADERS)
        object.writeHttpMetadata(headers)
        headers.set('etag', object.httpEtag)
        headers.set('Cache-Control', 'public, max-age=31536000')
        return new Response(object.body, { headers })
      }

      // 2. Upload (POST /upload)
      if (request.method === 'POST' && path === '/upload') {
        const formData = await request.formData()
        const file = formData.get('file')
        const key = formData.get('key')
        if (!file || !key) return jsonError('file and key are required', 400)

        const arrayBuffer = await file.arrayBuffer()
        await env.R2_BUCKET.put(key, arrayBuffer, {
          httpMetadata: { contentType: file.type || 'image/jpeg' },
        })
        return json({ ok: true, publicUrl: `${url.origin}/${key}` }, CORS_HEADERS)
      }

      // 3. Delete (POST /delete)
      if (request.method === 'POST' && path === '/delete') {
        const { key } = await request.json()
        await env.R2_BUCKET.delete(key)
        return json({ ok: true }, CORS_HEADERS)
      }

      // 4. Presign (POST /presign - opsiyonel, artık gerekmiyor)
      if (request.method === 'POST' && path === '/presign') {
        return handlePresign(request, env)
      }

    } catch (err) {
      return jsonError(err.message, 500)
    }

    return new Response('Not found', { status: 404, headers: CORS_HEADERS })
  },
}

function json(data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

// Geriye kalan AWS Signature fonksiyonlarını buraya ekleyebilirsin (Eskisiyle aynı kalabilir)
async function handlePresign(request, env) {
  // ... (mevcut kodun devamı aynı kalabilir, yukarıdaki ana fetch döngüsü yeterli)
  return jsonError('Deprecated. Use /upload instead.', 400)
}
