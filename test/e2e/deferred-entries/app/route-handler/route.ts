import { NextResponse } from 'next/server'

const ROUTE_HANDLER_CALLBACK_TIMESTAMP = 0

export function GET() {
  return NextResponse.json({
    message: 'Hello from app route handler',
    callbackTimestamp: ROUTE_HANDLER_CALLBACK_TIMESTAMP,
  })
}
