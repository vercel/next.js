const state = globalThis as typeof globalThis & {
  wsExecutions?: Map<string, number>
}

export function GET(request: Request) {
  const key = new URL(request.url).searchParams.get('key') || 'default'
  return Response.json({ executions: state.wsExecutions?.get(key) || 0 })
}
