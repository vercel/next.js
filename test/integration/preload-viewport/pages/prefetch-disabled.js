import Link from 'next/link'

export default () => {
  return (
    <div>
      <br />
      <Link href="/another" prefetch={false}>
        <a id="link-another">to /another</a>
      </Link>
    </div>
  )
}
