// 'some-lib' is aliased to `false` in next.config.js.
// Dynamic import should resolve to `Promise.resolve({})`.
export async function GET() {
  const mod = await import('some-lib')
  return Response.json({
    dynamicImport: mod,
  })
}
