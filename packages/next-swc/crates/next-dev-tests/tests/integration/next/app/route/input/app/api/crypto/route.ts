import { NextResponse } from 'next/server'
import { generateKey } from 'crypto'
import { promisify } from 'util'

const generate = promisify(generateKey)

export async function GET(): Promise<Response> {
  const key = await generate('hmac', { length: 64 })

  return NextResponse.json({ data: key.type })
}
