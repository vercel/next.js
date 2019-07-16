import { useRouter } from 'next/router'

const Page = () => {
  const router = useRouter()
  const { post, id } = router.query

  return (
    <>
      <p>
        {`Blog post ${post} comment ${id || '(all)'}`}
      </p>
    </>
  )
}

Page.getInitialProps = () => ({})

export default Page
