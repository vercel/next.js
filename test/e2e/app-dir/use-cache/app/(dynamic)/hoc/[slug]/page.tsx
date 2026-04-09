'use cache: remote'

import { withSlug } from './with-slug'

const Page = withSlug(function PageWithSlug({ slug }: { slug: string }) {
  return (
    <div>
      <p>
        Slug: <span id="slug">{slug}</span>
      </p>
      <p>
        Date: <span id="date">{new Date().toISOString()}</span>
      </p>
    </div>
  )
})

export default Page
