import { unstable_io } from 'next/cache'

export default function PagesGSSP({ rendered }: { rendered: string }) {
  return (
    <>
      <p>This page uses unstable_io() in getServerSideProps.</p>
      <div id="pages-content">{rendered}</div>
    </>
  )
}

export async function getServerSideProps() {
  await unstable_io()
  return { props: { rendered: 'ok' } }
}
