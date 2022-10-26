import Link from 'next/link'
import { Trans } from '@lingui/macro'

const Index = () => (
  <div>
    <Trans>Hello World.</Trans>
    <Link href="/two">
      <Trans>Go to page 2</Trans>
    </Link>
    <br />
  </div>
)

export default Index
