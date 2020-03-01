import baseTheme from '../../base.module.css'
import theme from './content.module.css'
import cx from 'classnames'

export default function Content({ bodyHtml }) {
  return (
    <div className={theme.content}>
      <div
        className={cx(theme.container, baseTheme.container)}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </div>
  )
}
