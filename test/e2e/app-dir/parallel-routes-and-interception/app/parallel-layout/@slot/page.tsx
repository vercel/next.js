import Link from 'next/link'

export default function Page() {
  return (
    <>
      <div>slot children</div>
      <Link href="/parallel-layout/subroute">parallel subroute</Link>
    </>
  )
}
