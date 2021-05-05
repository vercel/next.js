import React from 'react'
import { useIdk } from '../context'

const Page = () => {
  const idk = useIdk()

  console.log(idk)

  return (
    <>
      <p>Value: {idk}</p>
    </>
  )
}

export default Page
