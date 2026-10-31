import { notFound } from 'next/navigation'

export const instant = false

async function lookup(token: string): Promise<string | null> {
  await new Promise((resolve) => setTimeout(resolve, 10))
  return token === 'good' ? 'A report' : null
}

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const report = await lookup(token)

  if (!report) {
    notFound()
  }

  return <main>{report}</main>
}
