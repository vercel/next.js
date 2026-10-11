// 'some-lib' is aliased to `false` in next.config.js.
// Turbopack resolves the dynamic import to `{}`; webpack's empty module interop
// resolves it to `{ default: {} }`.
export async function GET() {
  const mod = await import('some-lib')
  return Response.json({
    dynamicImport: mod,
  })
}
