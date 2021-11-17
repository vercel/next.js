import markdownStyles from './markdown-styles.module.css'

export default function PostBody({ content }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className={markdownStyles['markdown']}>
        <div dangerouslySetInnerHTML={{ __html: content }}></div>
      </div>
    </div>
  )
}
