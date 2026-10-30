export function GET() {
  const store = globalThis as typeof globalThis & {
    __instrumentationPackages?: { name: string; external?: boolean }[]
    __injected?: string[]
  }
  return Response.json({
    packages: store.__instrumentationPackages ?? [],
    injected: store.__injected ?? [],
  })
}
