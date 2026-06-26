import { useRouter } from 'next/router'

console.log('hello from hello.js')

const Page = () => {
  const { query } = useRouter()
  return (
    <>
      <h3>hello world</h3>
      <span>{JSON.stringify(query)}</span>
    </>
  )
}

export default Page
