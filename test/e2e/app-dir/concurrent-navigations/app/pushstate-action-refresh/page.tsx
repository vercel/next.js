import { Client } from './client'

async function Slow() {
  await new Promise((r) => setTimeout(r, 1000))
  return <p id="slow-content">slow resolved</p>
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  await searchParams
  return (
    <main>
      <Client />
      <Slow />
    </main>
  )
}
