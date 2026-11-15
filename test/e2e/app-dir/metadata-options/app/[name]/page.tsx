import { cases, getCase } from '../../cases'

export function generateStaticParams() {
  return cases.map(({ name }) => ({ name }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  return getCase((await params).name).metadata || {}
}

export async function generateViewport({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  return getCase((await params).name).viewport || {}
}

export default function Page() {
  return <p>Metadata reference case</p>
}
