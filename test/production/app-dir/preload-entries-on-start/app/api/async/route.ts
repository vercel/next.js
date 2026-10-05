export const dynamic = 'force-dynamic'

const value = await Promise.resolve('async userland')
console.log('preload-test:async-evaluated')

export function GET() {
  return Response.json({ value })
}
