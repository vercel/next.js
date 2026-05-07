import { io } from 'next/cache'

export default function PagesGSSP({ rendered }: { rendered: string }) {
  return (
    <>
      <p>This page uses io() in getServerSideProps.</p>
      <div id="pages-content">{rendered}</div>
    </>
  )
}

export async function getServerSideProps() {
  await io()
  return { props: { rendered: 'ok' } }
}
