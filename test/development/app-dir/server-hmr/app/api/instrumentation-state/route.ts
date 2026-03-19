export function GET() {
  return Response.json({
    version: (globalThis as any).__instrumentationVersion ?? 'not-set',
    depEvaluatedAt:
      (globalThis as any).__instrumentationDepEvaluatedAt ?? 'not-set',
  })
}
