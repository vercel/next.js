import { NextResponse } from 'next/server'

export const revalidate = 60

export function GET() {
  if (process.env.WEBSOCKET_RUNTIME_UPGRADE === '1') {
    const state = globalThis as typeof globalThis & {
      standaloneStaticUpgradeExecutions?: number
    }
    state.standaloneStaticUpgradeExecutions =
      (state.standaloneStaticUpgradeExecutions || 0) + 1
    return NextResponse.upgrade({})
  }

  return Response.json({ phase: 'build' })
}
