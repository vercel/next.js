import Link from 'next/link'
import { Trans } from '@lingui/macro'
import withLang from '../components/withLang'
import LangSwitcher from '../components/LangSwitcher'

const Index = () =>
  <div>
    <Trans>Hello World.</Trans>
    <Link href='/two'><a><Trans>Go to page 2</Trans></a></Link>
    <br />
    <LangSwitcher />
  </div>

export default withLang(Index)
