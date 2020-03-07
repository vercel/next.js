import textStyles from './text-styles.module.css'
import blockStyles from './block-styles.module.css'
import cn from 'classnames'

export default function P({ children }) {
  return (
    <p className={cn(blockStyles['body-block'], textStyles['body-text'])}>
      {children}
    </p>
  )
}
