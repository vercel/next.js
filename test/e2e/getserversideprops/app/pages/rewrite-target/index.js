import { useRouter } from 'next/router'

export async function getServerSideProps({ req }) {
  return { props: { url: req.url } }
}

export default function RewriteTarget({ url }) {
  const router = useRouter()

  return (
    <>
      <h1>rewrite-target</h1>
      <p id="as-path">{router.asPath}</p>
      <p id="req-url">{url}</p>
    </>
  )
}
