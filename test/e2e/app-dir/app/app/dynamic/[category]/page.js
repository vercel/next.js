import { cookies } from 'next/headers'

const Page = async () => {
  const result = cookies().get('session')?.value ? 'has cookie' : 'no cookie'
  return <div id="cookie-result">{result}</div>
}

export const generateStaticParams = async () => {
  return [{ category: 'frameworks' }]
}

export const dynamic = 'force-dynamic'
export const dynamicParams = true
export const revalidate = 60

export default Page
