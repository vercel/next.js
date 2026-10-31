import Link from 'next/link'
import { Suspense } from 'react'

async function Content(props) {
  const params = await props.params
  return <h1 id="slug-page">Visiting page {params.slug}</h1>
}

export default function Page(props) {
  return (
    <div>
      <Suspense>
        <Content params={props.params} />
      </Suspense>
      <Link href="/blog/a-post" style={{ display: 'block' }} id="to-blog-post">
        Go to a post
      </Link>
      <Link href="/" style={{ display: 'block' }}>
        Go home
      </Link>
    </div>
  )
}
