import Link from 'next/link'
import { useRouter } from 'next/router'

const Index = ({ value }) => {
  const router = useRouter()

  return (
    <section>
      <h1>{value}</h1>
      <p id="router-path">
        <strong>{router.query.path}</strong>
      </p>
      <Link href="/another-page" id="linkelement">
        Link to another page
      </Link>
    </section>
  )
}

export async function getStaticPaths() {
  return {
    paths: [{ params: { path: 'another-page', pages: null } }],
    fallback: true,
  }
}

export async function getStaticProps() {
  return {
    props: {
      value: 'Hello',
    },
  }
}

export default Index
