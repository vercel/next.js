import Link from 'next/link'

const PrefetchDisabledSsg = () => {
  return (
    <div>
      <br />
      <Link href="/ssg/basic" prefetch={false}>
        <a id="link-ssg">to /ssg/basic</a>
      </Link>
    </div>
  )
}

export default PrefetchDisabledSsg
