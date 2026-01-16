import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const path = request.nextUrl.searchParams.get('path') || '/en/'

  revalidatePath(path)

  return NextResponse.json({ timestamp: new Date().toISOString() })
}
