export const dynamic = 'force-dynamic'

export default async function RendersPage() {
  const loadTime = 4000

  await sleep(loadTime)

  return 'content'
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
