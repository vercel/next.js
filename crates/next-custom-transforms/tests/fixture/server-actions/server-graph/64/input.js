'use cache'

// @ts-ignore
import { withSlug } from './with-slug'

const Page = withSlug(function Page({ slug }) {
  return <p>Slug: {slug}</p>
})

export default Page
