import { Debug } from '../../../components/debug'

export default async function Page({ params }) {
  return (
    <Debug
      page="/app/blog/[slug]/page.js"
      pathname={`/blog/${(await params).slug}`}
    />
  )
}
