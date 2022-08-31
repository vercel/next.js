import markdownStyles from './markdown-styles.module.css'
import { SliceZone } from '@prismicio/react'

export default function PostBody({ content }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className={markdownStyles['markdown']}>
        <p>Slice Zone incoming!</p>
        {/* <RichText render={content} /> */}
      </div>
    </div>
  )
}
