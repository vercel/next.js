import Link from 'next/link'

export default () => {
  return (
    <div>
      <br />
      <Link href="/ssg/basic" prefetch={false} id="link-ssg">
        to /ssg/basic
      </Link>
    </div>
  )
}
