import ReactDOM from 'react-dom'
import { useEffect } from 'react'
import { useRouter } from 'next/router'

const Page = () => {
  console.log(ReactDOM)
  const router = useRouter()
  useEffect(() => {
    router.push('/page2')
  })
  return <div id='page-1'>page1</div>
}

export default Page
