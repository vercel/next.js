import { useRouter } from 'next/router'

export default function UserTestPage() {
  const router = useRouter()

  return (
    <div>
      <p id="query">{JSON.stringify(router.query)}</p>
      <p id="pathname">{router.pathname}</p>
      <p id="as-path">{router.asPath}</p>
      <p id="user-id">{router.query.userId || 'MISSING'}</p>
      <button
        id="add-step"
        onClick={() => {
          router.push({
            pathname: router.pathname,
            query: { ...router.query, step: '1' },
          })
        }}
      >
        Add step
      </button>
      <button
        id="add-step-2"
        onClick={() => {
          router.push({
            pathname: router.pathname,
            query: { ...router.query, step: '2' },
          })
        }}
      >
        Add step 2
      </button>
    </div>
  )
}

export function getServerSideProps({ params }: { params: { userId: string } }) {
  return {
    props: {
      params,
    },
  }
}
