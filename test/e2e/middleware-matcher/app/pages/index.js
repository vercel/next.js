import Link from 'next/link'

export default function Page(props) {
  return (
    <div>
      <p id="index">root page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <Link href="/another-middleware" id="to-another-middleware">
        to /another-middleware
      </Link>
      <br />
      <Link href="/blog/slug-1" id="to-blog-slug-1">
        to /blog/slug-1
      </Link>
      <br />
    </div>
  )
}

export const getServerSideProps = () => {
  return {
    props: {
      message: 'Hello, world.',
    },
  }
}
