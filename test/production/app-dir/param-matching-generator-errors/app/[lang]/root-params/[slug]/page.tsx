import { lang } from 'next/root-params'

export async function experimental_generateParamMatching() {
  await lang()
  return { slug: 'blocking' }
}

export default function Page() {
  return <p>root params</p>
}
