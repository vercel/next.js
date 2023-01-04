import { BUILDER_CONFIG } from '@/lib/constants'
import { BuilderComponent } from '@builder.io/react'
export default function PostBody({ content }) {
  return (
    <div className="max-w-2xl mx-auto">
      <BuilderComponent
        options={{ includeRefs: true }}
        model={BUILDER_CONFIG.postsModel}
        content={content}
      />
    </div>
  )
}
