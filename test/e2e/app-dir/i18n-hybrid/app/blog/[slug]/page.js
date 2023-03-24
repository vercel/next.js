import { Debug } from '../../../components/debug'

export default function Page({ params }) {
  return (
    <Debug page="/app/blog/[slug]/page.js" pathname={`/blog/${params.slug}`} />
  )
}
