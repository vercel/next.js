import { useRouter } from 'next/router'

const Page = () => {
  const { pathname } = useRouter()
  return (
    <>
      <h3>{`page: another (${pathname})`}</h3>
    </>
  )
}

export default Page
