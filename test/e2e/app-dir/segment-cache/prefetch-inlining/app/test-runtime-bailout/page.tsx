import { cookies } from 'next/headers'

export const unstable_instant = {
  unstable_samples: [{ cookies: [{ name: 'theme', value: 'default' }] }],
}
export const prefetch = 'allow-runtime'

export default async function RuntimeBailoutPage() {
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value ?? 'default'
  return <p id="page-runtime-bailout">Runtime page (theme: {theme})</p>
}
