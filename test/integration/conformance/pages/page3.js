import Link from 'next/link'
import('lodash').then((_) => console.log(_.chunk(['a', 'b', 'c', 'd'], 2)))

const Page = () => {
  return (
    <div>
      <h2>Page3</h2>
      <Link href="/page2">
        <a id="page2-link">Page2</a>
      </Link>
    </div>
  )
}

export default Page
