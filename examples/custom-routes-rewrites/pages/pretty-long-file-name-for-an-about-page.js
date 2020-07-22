import Link from 'next/link'
import { useRouter } from 'next/router'

export default function LongAbout() {
  return (
    <div>
      <h3>This is the {useRouter().asPath} page.</h3>
      <p>
        {' '}
        This page was rendered from{' '}
        <code>{`pages${useRouter().route}.js`}</code> file.
      </p>
      <Link href="/">
        <a> &larr; Back home</a>
      </Link>
    </div>
  )
}
