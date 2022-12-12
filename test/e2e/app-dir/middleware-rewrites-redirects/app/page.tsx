import Link from 'next/link'

const Test = ({ page }: { page: string }) => {
  return (
    <>
      <Link id={`link-${page}`} href={`/${page}-before`}>
        Link to /{page}-before
      </Link>
    </>
  )
}

export default function Page() {
  return (
    <>
      <Test page="middleware-rewrite" />
    </>
  )
}
