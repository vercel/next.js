import { LargeBoundary } from '../components/large-boundary'

export async function getServerSideProps() {
  return { props: {} }
}

export default function Page() {
  return <LargeBoundary id="pages" />
}
