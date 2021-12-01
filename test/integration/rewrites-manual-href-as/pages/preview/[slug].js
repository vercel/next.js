import { useRouter } from 'next/router'
import Link from 'next/link'

export const getStaticProps = ({ params }) => {
  return {
    props: {
      params: params || null,
      preview: true,
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: 'blocking',
  }
}

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="preview">preview page</p>
      <p id="pathname">{router.pathname}</p>
      <p id="query">{JSON.stringify(router.query)}</p>
      <p id="props">{JSON.stringify(props)}</p>

      <Link href="/?imageId=123" as="/preview/123">
        <a id="to-modal">open modal for /preview/123</a>
      </Link>
      <br />

      <Link href="/preview/321">
        <a id="to-preview">go to /preview/321</a>
      </Link>
      <br />

      <Link href="/another">
        <a id="to-another">go to /another</a>
      </Link>
      <br />

      <Link href="/rewrite-me">
        <a id="to-rewrite-me">go to /rewrite-me</a>
      </Link>
      <br />

      <Link
        href={{ pathname: '/preview/[slug]', query: { slug: '321' } }}
        as="/rewrite-me"
      >
        <a id="to-preview-as-rewrite">go to /preview/321 as /rewrite-me</a>
      </Link>
      <br />
    </>
  )
}
