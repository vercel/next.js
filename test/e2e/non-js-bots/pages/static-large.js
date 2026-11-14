import { LargeBoundary } from '../components/large-boundary'

export async function getStaticProps() {
  // ISR so the request still reaches the function when deployed; purely
  // static routes are served from the CDN without invoking it.
  return { props: {}, revalidate: 60 }
}

export default function Page() {
  return <LargeBoundary id="pages" />
}
