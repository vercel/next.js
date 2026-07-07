import { io } from 'next/cache'

export default function PagesGSP({ rendered }: { rendered: string }) {
  return (
    <>
      <p>This page uses io() in getStaticProps.</p>
      <div id="pages-content">{rendered}</div>
    </>
  )
}

export async function getStaticProps() {
  await io()
  return { props: { rendered: 'ok' } }
}
