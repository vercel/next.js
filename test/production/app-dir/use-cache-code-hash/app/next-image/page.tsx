import Image from 'next/image'

async function logic() {
  'use cache'
  return Date.now()
}

export default async function Page() {
  const value = await logic()
  return (
    <div>
      <Image src="/vercel.svg" alt="Vercel Logo" width={72} height={16} />
      <p>{value}</p>
    </div>
  )
}
