import { useRouter } from 'next/router'

const Page = () => {
  const router = useRouter()
  const { name, id } = router.query

  return (
    <>
      <p id="asdf">
        Blog post {name} comment {id || '(all)'}
      </p>
    </>
  )
}

Page.getInitialProps = () => ({})

export default Page
