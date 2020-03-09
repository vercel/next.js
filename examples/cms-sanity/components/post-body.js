import markdownStyles from './markdown-styles.module.css'
import BlockContent from '@sanity/block-content-to-react'

export default function PostBody({ content }) {
  return (
    <div className="max-w-2xl mx-auto">
      <BlockContent blocks={content} className={markdownStyles.markdown} />
    </div>
  )
}
