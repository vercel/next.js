import { Trans } from '@lingui/macro'
import withLang from '../components/withLang'
import LangSwitcher from '../components/LangSwitcher'

const Two = () => (
  <div>
    <Trans>Page two. </Trans>
    <br />
    <LangSwitcher />
  </div>
)

export default withLang(Two)
