export function GET() {
  const state = globalThis as typeof globalThis & {
    standaloneStaticUpgradeExecutions?: number
  }
  return Response.json({
    executions: state.standaloneStaticUpgradeExecutions || 0,
  })
}
