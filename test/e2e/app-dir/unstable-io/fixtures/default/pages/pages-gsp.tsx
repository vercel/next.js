import { unstable_io } from 'next/cache'

export default function PagesGSP({ rendered }: { rendered: string }) {
  return (
    <>
      <p>This page uses unstable_io() in getStaticProps.</p>
      <div id="pages-content">{rendered}</div>
    </>
  )
}

export async function getStaticProps() {
  await unstable_io()
  return { props: { rendered: 'ok' } }
}
