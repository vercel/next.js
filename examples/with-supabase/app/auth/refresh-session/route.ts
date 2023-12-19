import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = cookies()
  const supabase = createClient(cookieStore)

  // Refresh session if expired.
  // This is required for Server Components
  // as they only have read access to cookies.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return NextResponse.json(session)
}
