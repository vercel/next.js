import { lang } from 'next/root-params'

export default function Page() {
  return <p>root-params</p>
}

export async function generateStaticParams() {
  await lang()
  return [{ slug: 'test' }]
}
