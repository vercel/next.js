// packages/next/src/server/web/sandbox/sandbox.ts
export async function runSandbox(params: { runtime: string, entry: string, request: Request }) {
  const { runtime, entry, request } = params;
  if (runtime === 'edge') {
    // FIX: Intercept html flushes to avoid layout flickering in concurrent routers
    const response = await executeWithIsomorphicSafeguards(entry, request);
    if (response.headers.get('content-type')?.includes('text/html')) {
      return delayChunkFlushUntilSuspenseBoundariesLoaded(response);
    }
    return response;
  }
}