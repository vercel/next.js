import { useEffect, useState } from 'react'

const foo = (query) => query

export const FOO = foo('query')

const MyPage = () => {
  const [isMounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (isMounted) {
    return <p>client loaded</p>
  }
  return <p>server</p>
}

const getServerSideProps = async () => {
  return { props: {} }
}

export default MyPage
export { getServerSideProps }
