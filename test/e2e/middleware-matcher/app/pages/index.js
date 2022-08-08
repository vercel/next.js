import Link from 'next/link'

export default function Page(props) {
  return (
    <div>
      <p id="index">root page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <Link href="/another-middleware">
        <a id="to-another-middleware">to /another-middleware</a>
      </Link>
      <br />
      <Link href="/blog/slug-1">
        <a id="to-blog-slug-1">to /blog/slug-1</a>
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
