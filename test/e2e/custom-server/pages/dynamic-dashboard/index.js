import { useRouter } from 'next/router'

// NOTE: we want this page to be dynamic, otherwise the HTML won't contain search params
export async function getServerSideProps() {
  return { props: {} }
}

export default function Page() {
  const router = useRouter()
  const searchParam = router.query.q
  return (
    <p>
      made it to dynamic dashboard
      {!!searchParam && (
        <>
          <br />
          query param: {searchParam}
        </>
      )}
    </p>
  )
}
