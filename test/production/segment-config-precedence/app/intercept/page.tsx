import Link from 'next/link'

export const runtime = 'nodejs'
export const preferredRegion = 'sfo1'
export const maxDuration = 20

export default function Page() {
  return (
    <>
      <p id="runtime">{process.env.NEXT_RUNTIME}</p>
      <Link id="target" href="/intercept/target" prefetch={false}>
        target
      </Link>
    </>
  )
}
