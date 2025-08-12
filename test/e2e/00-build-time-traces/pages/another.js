import { getContent } from '../lib/get-content'

export async function getStaticProps() {
  return {
    props: {
      now: Date.now(),
      content: await getContent(),
    },
    revalidate: 1,
  }
}

export default function Page(props) {
  return (
    <>
      <p id="page">/another</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
