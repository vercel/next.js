import Link from 'next/link'

export default function Index() {
  return (
    <div id="page">
      <Link href="/" id="link1">
        link to /
      </Link>
      {' | '}
      <Link href="/index" id="link2">
        link to /index
      </Link>
      {' | '}
      <Link href="/index/index" id="link3">
        link to /index/index
      </Link>
      {' | '}
      <Link href="/index/index/index" id="link4">
        link to /index/index/index
      </Link>
      {' | '}
      <Link href="/index/user" id="link5">
        link to /index/user
      </Link>
      {' | '}
      <Link href="/index/project" id="link6">
        link to /index/project
      </Link>
    </div>
  )
}
