import Link from 'next/link'

export default function Page() {
  return (
    <div id="title">
      <Link id="to-index" href="/">
        to index
      </Link>
    </div>
  )
}

export const metadata = {
  title: 'this is the page title',
}
