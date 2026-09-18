import Link from 'next/link'

export default function Header() {
  return (
    <header className="mb-20 mt-8 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2 text-xl font-bold">
        <span className="rounded-lg bg-primary-600 px-2 py-1 text-white">
          Acme
        </span>
        <span className="text-secondary-700">Lease Blog</span>
      </Link>
    </header>
  )
}
