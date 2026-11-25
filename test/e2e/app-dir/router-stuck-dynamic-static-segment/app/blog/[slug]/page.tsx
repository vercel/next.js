import Link from 'next/link'
import { Suspense } from 'react'

async function Content(props) {
  const params = await props.params
  return <h1>Blog post {params.slug}</h1>
}

export default function Blog(props) {
  return (
    <div id="blog-post-page">
      <Suspense>
        <Content params={props.params} />
      </Suspense>
      <Link href="/" style={{ display: 'block' }}>
        Go home
      </Link>
    </div>
  )
}
