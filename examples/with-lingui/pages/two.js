import { Trans } from '@lingui/macro'
import Link from 'next/link'

const Two = () => (
  <div>
    <Trans>Page two.</Trans>{' '}
    <Link href="/">
      <a>
        <Trans>Back home</Trans>
      </a>
    </Link>
    <br />
  </div>
)

export default Two
