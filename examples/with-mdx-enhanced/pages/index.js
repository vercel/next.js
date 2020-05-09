import { frontMatter as Posts } from './posts/*'
import Link from 'next/link'

export default function Home() {
  return (
    <div>
      {Posts.map(post => (
        <div key={post.__resourcePath}>
          <Link href={formatPath(`/${post.__resourcePath}`)}>{post.title}</Link>
        </div>
      ))}
    </div>
  )
}

function formatPath(p) {
  return p.replace(/\.mdx$/, '')
}
