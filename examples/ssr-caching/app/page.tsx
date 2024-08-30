import { headers } from 'next/headers'

export const revalidate = 10;

export default async function Page() {
  const time = await getData();

  return (
    <main>
      <h1>SSR Caching with Next.js</h1>
      <time dateTime={time}>{time}</time>
    </main>
  )
}

async function getData() {
  const headersList = headers()
  
  return new Date().toISOString()
}