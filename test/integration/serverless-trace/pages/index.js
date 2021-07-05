import Link from 'next/link'

const Index = () => {
  return (
    <div>
      Hello World
      <Link href="/fetch">
        <a id="fetchlink">fetch page</a>
      </Link>
    </div>
  )
}

export default Index
