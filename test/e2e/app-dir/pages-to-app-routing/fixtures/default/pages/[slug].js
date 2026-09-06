import Link from 'next/link'

export async function getServerSideProps({ params }) {
  return {
    props: {
      params,
    },
  }
}

export default function Page({ params }) {
  return (
    <>
      <h1 id="params">Params: {JSON.stringify(params)}</h1>
      <Link id="to-about-link" href="/about">
        To About
      </Link>
    </>
  )
}
