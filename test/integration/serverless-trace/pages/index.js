import Link from 'next/link'
export default () => {
  return (
    <div>
      Hello World
      <Link href="/fetch">
        <a id="fetchlink">fetch page</a>
      </Link>
    </div>
  )
}
