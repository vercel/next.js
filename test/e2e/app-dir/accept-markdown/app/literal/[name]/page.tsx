// Generated paths containing characters that path-to-regexp treats specially.
export function generateStaticParams() {
  return [{ name: 'c(d)' }, { name: 'e*f' }]
}

export const dynamicParams = false

export async function markdown({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name } = await params
  return `# Literal ${decodeURIComponent(name)}\n`
}

export default async function Page({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name } = await params
  return <h1>Literal {decodeURIComponent(name)}</h1>
}
