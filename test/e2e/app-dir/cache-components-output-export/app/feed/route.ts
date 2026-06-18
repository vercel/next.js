export function generateStaticParams() {
  return [{}]
}

async function getFeed() {
  'use cache'
  return 'feed-body'
}

export async function GET() {
  return new Response(await getFeed())
}
