export function GET() {
  return new Response(
    typeof globalThis.crypto === 'object'
      ? 'crypto is available'
      : 'crypto is not available'
  )
}

export const runtime = 'nodejs'
