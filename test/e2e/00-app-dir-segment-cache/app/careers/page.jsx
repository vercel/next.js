import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <div>Listings Page:</div>
      {['foobar-1', 'foobar-2'].map((i) => (
        <div key={i}>
          <Link href={`/careers/${i}`}>{i}</Link>
        </div>
      ))}
    </div>
  )
}
