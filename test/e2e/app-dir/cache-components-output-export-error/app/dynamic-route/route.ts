import { setTimeout } from 'timers/promises'

// Opts into static generation (generateStaticParams) but does uncached async
// work that isn't wrapped in `use cache`, so it can't be fully prerendered.
export function generateStaticParams() {
  return [{}]
}

export async function GET() {
  await setTimeout(50)
  return new Response('dynamic')
}
