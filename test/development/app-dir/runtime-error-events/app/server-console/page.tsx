import Link from 'next/link'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  if (error !== 'disabled') {
    console.error(new Error('server console failed'))
  }
  return (
    <>
      <p id="content">Before edit</p>
      <Link id="recur" href="/server-console?error=recur" prefetch={false}>
        Recur
      </Link>
    </>
  )
}
