import B from 'node:buffer'
import { NextResponse } from 'next/server'

/**
 * @param {Request} req
 */
export async function POST(req) {
  const text = await req.text()
  const buf = B.Buffer.from(text)
  return NextResponse.json({
    'Buffer === B.Buffer': B.Buffer === Buffer,
    encoded: buf.toString('base64'),
    exposedKeys: Object.keys(B),
  })
}

export const runtime = 'edge'
