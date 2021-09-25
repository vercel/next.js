import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <p id="page">hello world</p>
      <Link href="/_layout">
        <a>layout</a>
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
