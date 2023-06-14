import Link from 'next/link'

export default async function Page({ searchParams: { timeout } }) {
  const randomNumber = await new Promise((resolve) => {
    setTimeout(
      () => {
        resolve(Math.random())
      },
      timeout !== undefined ? Number.parseInt(timeout, 10) : 0
    )
  })

  return (
    <>
      <div>
        <Link href="/"> Back to Home </Link>
      </div>
      <div id="random-number">{randomNumber}</div>
    </>
  )
}
