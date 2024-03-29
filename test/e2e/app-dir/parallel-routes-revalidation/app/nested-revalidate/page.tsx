import Link from 'next/link'

export default function Home() {
  return (
    <div className="text-center h-screen flex flex-col gap-4 justify-center w-60 mx-auto">
      <p>Nested parallel routes demo.</p>
      <p id="page-now">Date.now {Date.now()}</p>
      <div className="flex flex-col gap-2">
        <Link
          href="/nested-revalidate/drawer"
          className="bg-sky-600 text-white p-2 rounded"
        >
          Open Drawer
        </Link>
        <Link
          href="/nested-revalidate/modal"
          className="bg-sky-600 text-white p-2 rounded"
        >
          Open Modal
        </Link>
      </div>
    </div>
  )
}
