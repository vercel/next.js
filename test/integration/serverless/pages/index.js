import Link from 'next/link'
export default () => {
  return (
    <div>
      Hello World
      <Link href="/fetch">
        <a id="fetchlink">fetch page</a>
      </Link>
      <Link href="/fetch-cjs">
        <a id="fetchcjslink">fetch cjs page</a>
      </Link>
    </div>
  )
}
