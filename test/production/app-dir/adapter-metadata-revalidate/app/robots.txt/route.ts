import { cacheLife, cacheTag } from 'next/cache'

async function getRobots() {
  'use cache'
  cacheLife('hours')
  cacheTag('adapter-metadata-revalidate:robots')

  return `User-agent: *\nAllow: /\n# generated at ${Date.now()}\n`
}

export async function GET() {
  return new Response(await getRobots(), {
    headers: { 'content-type': 'text/plain' },
  })
}
