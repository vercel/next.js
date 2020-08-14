import Link from 'next/link'

const Index = () => {
  return (
    <div className="main">
      <Link href="/birds">
        <a>Birds Example</a>
      </Link>
      <Link href="/boxes">
        <a>Boxes Example</a>
      </Link>
    </div>
  )
}

export default Index
