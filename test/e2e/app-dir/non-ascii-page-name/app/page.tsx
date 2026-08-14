import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <p>home</p>
      <Link href="/тест" id="link-to-test">
        Go to тест
      </Link>
      <Link href="/блог/hello" id="link-to-blog">
        Go to блог
      </Link>
    </div>
  )
}
