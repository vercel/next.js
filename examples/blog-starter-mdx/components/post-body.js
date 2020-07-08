import cn from 'classnames'
import markdownStyles from './markdown-styles.module.css'

export default function PostBody({ content }) {
  return (
    <div className={cn('max-w-2xl', 'mx-auto', markdownStyles['markdown'])}>
      {content}
    </div>
  )
}
