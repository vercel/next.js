import Link from 'next/link?loaderQuery'

if (typeof window === 'undefined') {
  try {
    let file = 'clear.js'
    require('es5-ext/array/#/' + file)
  } catch (_) {}
  import('nanoid').then((mod) => console.log(mod.nanoid()))
}

// prevent static generation for build trace test
export function getServerSideProps() {
  return {
    props: {},
  }
}

export default function Page() {
  return (
    <div>
      <Link href="/about">About Page</Link>
      <p className="index-page">Hello World</p>
    </div>
  )
}
