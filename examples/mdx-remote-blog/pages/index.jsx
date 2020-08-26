import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import Link from 'next/link'

const root = process.cwd()

export default function IndexPage({ postData }) {
  return (
    <>
      <h1>My Cool Blog</h1>
      <ul>
        {postData.map((data) => (
          <li key={data.slug}>
            <Link href="/blog/[slug]" as={`/blog/${data.slug}`}>
              <a>{data.frontMatter.title}</a>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

export async function getStaticProps() {
  const contentRoot = path.join(root, 'content')
  const postData = fs.readdirSync(contentRoot).map((p) => {
    const content = fs.readFileSync(path.join(contentRoot, p), 'utf8')
    return {
      slug: p.replace(/\.mdx/, ''),
      content,
      frontMatter: matter(content).data,
    }
  })
  return { props: { postData } }
}
