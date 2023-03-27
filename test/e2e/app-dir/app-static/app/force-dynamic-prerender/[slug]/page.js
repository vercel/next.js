import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const dynamicParams = true
export const revalidate = 60

export const generateStaticParams = async () => {
  return [{ slug: 'frameworks' }]
}

export default function Page({ params }) {
  const result = cookies().get('session')?.value ? 'has cookie' : 'no cookie'
  return (
    <div>
      <div id="slug">{params.slug}</div>
      <div id="cookie-result">{result}</div>
    </div>
  )
}
