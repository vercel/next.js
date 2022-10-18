import Link from 'next/link'
export default () => {
  return (
    <div>
      Hello World
      <Link href="/fetch" id="fetchlink">
        fetch page
      </Link>
    </div>
  )
}
