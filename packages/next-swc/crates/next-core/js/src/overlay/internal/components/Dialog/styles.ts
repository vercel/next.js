import { noop as css } from '../../helpers/noop-template'
import { styles as dialogStyles } from './Dialog'
import { styles as bodyStyles } from './DialogBody'
import { styles as contentStyles } from './DialogContent'
import { styles as headerStyles } from './DialogHeader'
import { styles as tabListStyles } from './DialogHeaderTabList'

const styles = css`
  ${dialogStyles}
  ${bodyStyles}
  ${contentStyles}
  ${headerStyles}
  ${tabListStyles}
`

export { styles }
