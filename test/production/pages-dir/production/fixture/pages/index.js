import Link from 'next/link?loaderQuery'

// prevent static generation for build trace test
export function getServerSideProps() {
  try {
    require('es5-ext/array/from/index.js')
  } catch (_) {}
  import('nanoid').then((mod) => console.log(mod.nanoid()))
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
