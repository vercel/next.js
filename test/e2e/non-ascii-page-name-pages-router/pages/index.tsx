import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <p>home</p>
      <Link href="/тест" data-test="link-to-test">
        Go to тест
      </Link>
      <Link href="/блог/hello" data-test="link-to-blog">
        Go to блог
      </Link>
    </div>
  )
}
