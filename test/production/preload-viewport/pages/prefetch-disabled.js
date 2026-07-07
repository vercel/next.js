import Link from 'next/link'

export default () => {
  return (
    <div>
      <br />
      <Link href="/another" prefetch={false} id="link-another">
        to /another
      </Link>
    </div>
  )
}
