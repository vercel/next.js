export const dynamic = 'force-dynamic'

export default async function FormPage() {
  const loadTime = 2000

  await sleep(loadTime)

  return 'content'
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
