import { notFound } from 'next/navigation'

export const instant = false

export function generateStaticParams() {
  return [{ slug: 'not-found' }]
}

export const metadata = {
  title: 'main page metadata marker',
}

export async function generateViewport() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { themeColor: 'black' }
}

export default function Page() {
  notFound()
}
