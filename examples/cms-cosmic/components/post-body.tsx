import markdownStyles from './markdown-styles.module.css'

type PostBodyProps = {
  content: string
}

const PostBody = (props: PostBodyProps) => {
  const { content } = props
  return (
    <div className="max-w-2xl mx-auto">
      <div
        className={markdownStyles['markdown']}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  )
}

export default PostBody
