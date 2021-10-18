import markdownStyles from './markdown-styles.module.css'

export default function PostBody({ content }) {
  return (
    <div className="max-w-2xl mx-auto prose text-black lg:prose-xl">
      <div className={markdownStyles['markdown']} dangerouslySetInnerHTML={{__html: content}}>
      </div>
    </div>
  )
}
