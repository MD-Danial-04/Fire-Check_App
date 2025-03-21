import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  await supabase.auth.getSession()

  // Only add cache headers for Supabase API requests
  if (request.nextUrl.href.includes('supabase.co')) {
    // Add cache-control headers
    response.headers.set(
      'Cache-Control',
      'public, max-age=300, stale-while-revalidate=60'
    )
  }

  return response
}

export const config = {
  matcher: [
    // Match all API routes that go to Supabase
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
} 