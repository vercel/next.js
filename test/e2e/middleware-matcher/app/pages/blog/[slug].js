import Link from 'next/link'

export default function Page(props) {
  return (
    <div>
      <p id="blog">This should not run the middleware</p>
      <p id="props">{JSON.stringify(props)}</p>
      <Link href="/another-middleware">
        <a id="to-another-middleware">to /another-middleware</a>
      </Link>
      <br />
      <Link href="/blog/slug-2">
        <a id="to-blog-slug-2">to /blog/slug-2</a>
      </Link>
      <br />
    </div>
  )
}

export const getServerSideProps = ({ params }) => {
  return {
    props: {
      params,
      message: 'Hello, magnificent world.',
    },
  }
}
