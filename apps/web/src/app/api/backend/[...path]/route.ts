import { type NextRequest, NextResponse } from 'next/server'

const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3333').replace(
  /\/$/,
  '',
)

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params
  const target = `${API_INTERNAL_URL}/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`

  const headers = new Headers()

  for (const [key, value] of request.headers.entries()) {
    if (['host', 'connection', 'content-length', 'accept-encoding'].includes(key)) {
      continue
    }
    headers.set(key, value)
  }

  let body: ArrayBuffer | undefined

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const buffer = await request.arrayBuffer()
    if (buffer.byteLength > 0) {
      body = buffer
    }
  }

  let upstream: Response

  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'API_UNAVAILABLE',
          message: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
        },
      },
      { status: 502 },
    )
  }

  const responseHeaders = new Headers()

  upstream.headers.forEach((value, key) => {
    if (['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding'].includes(key)) {
      return
    }
    responseHeaders.set(key, value)
  })

  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookie)
  }

  const responseBody = request.method === 'HEAD' ? null : await upstream.arrayBuffer()

  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export const dynamic = 'force-dynamic'

export {
  proxy as DELETE,
  proxy as GET,
  proxy as HEAD,
  proxy as OPTIONS,
  proxy as PATCH,
  proxy as POST,
  proxy as PUT,
}
