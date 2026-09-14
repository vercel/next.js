import { useRouter } from 'next/router'

export default function CatchAll() {
  const router = useRouter()
  return (
    <div>
      <h1 id="page-title">CatchAll</h1>
      <p id="query-path">{JSON.stringify(router.query.path)}</p>
    </div>
  )
}

export async function getServerSideProps() {
  return { props: {} }
}
