import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function GET() {
  revalidatePath('/')

  return NextResponse.json({ success: true })
}
