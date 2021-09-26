import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <p id="page">test</p>
      <Link href="/">
        <a>home</a>
      </Link>
    </div>
  )
}

export async function getStaticProps(context) {
  console.log('Fetching page props!')
  return {
    props: {
      layout: false,
    },
    revalidate: 1,
  }
}
