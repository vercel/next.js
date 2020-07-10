import markdownStyles from './markdown-styles.module.css'

export default function HtmlContent({ content }) {
  return (
    <div
      className={markdownStyles['markdown']}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}
