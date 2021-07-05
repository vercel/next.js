import Link from 'next/link'

const PrefetchDisabled = () => {
  return (
    <div>
      <br />
      <Link href="/another" prefetch={false}>
        <a id="link-another">to /another</a>
      </Link>
    </div>
  )
}

export default PrefetchDisabled
