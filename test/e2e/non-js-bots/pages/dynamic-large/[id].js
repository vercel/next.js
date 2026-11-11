import { LargeBoundary } from '../../components/large-boundary'

export async function getStaticPaths() {
  return { paths: [{ params: { id: '1' } }], fallback: false }
}

export async function getStaticProps() {
  return { props: {} }
}

export default function Page() {
  return <LargeBoundary id="pages" />
}
