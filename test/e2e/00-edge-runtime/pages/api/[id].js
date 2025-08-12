import { NextResponse } from 'next/server'

export default function handler(req) {
  return NextResponse.json({ page: '[id]' })
}

export const config = {
  runtime: 'experimental-edge',
}
