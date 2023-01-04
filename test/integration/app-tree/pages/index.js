import { useContext } from 'react'
import { DummyContext } from './_app'
import { useRouter } from 'next/router'

const Page = () => {
  const { pathname } = useRouter()
  const ctx = useContext(DummyContext)
  if (ctx == null) throw new Error('context consumes failed')

  return (
    <>
      <h3>page: {pathname}</h3>
    </>
  )
}

export default Page
