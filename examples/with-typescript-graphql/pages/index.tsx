import withApolo from '../lib/with-apolo'
import Link from 'next/link'
import { useViewerQuery } from './viewer.graphql'

const Index = () => {
  const { data } = useViewerQuery()

  if (data) {
    const { viewer } = data
    return (
      <div>
        You're signed in as {viewer.name} and you're {viewer.status} goto{' '}
        <Link href="/about">
          <a>static</a>
        </Link>{' '}
        page.
      </div>
    )
  }

  return <div>...</div>
}

export default withApolo(Index)
