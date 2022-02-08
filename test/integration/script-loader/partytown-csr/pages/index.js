import Link from 'next/link'

const Page = () => {
  return (
    <div class="container">
      <div>Home Page</div>
      <div>
        <Link href="/page1">Page1</Link>
      </div>
    </div>
  )
}

export default Page
