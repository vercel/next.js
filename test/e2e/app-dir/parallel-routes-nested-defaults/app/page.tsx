import Link from 'next/link'

export default function Page() {
  return (
    <div id="children-slot">
      <Link href="/dynamic" className="underline">
        To /dynamic
      </Link>{' '}
      <Link href="/dynamic2" className="underline">
        To /dynamic2
      </Link>{' '}
    </div>
  )
}
