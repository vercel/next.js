import textStyles from './text-styles.module.css'
import layoutStyles from './layout-styles.module.css'
import cn from 'classnames'

export default function P({ children }) {
  return (
    <p className={cn(layoutStyles['body-block'], textStyles['body-text'])}>
      {children}
    </p>
  )
}
