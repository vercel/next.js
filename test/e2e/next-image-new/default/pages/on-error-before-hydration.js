import { useState } from 'react'
import Image from 'next/image'

const Page = () => {
  const [msg, setMsg] = useState(`default state`)
  return (
    <div>
      <Image
        id="img"
        src="/404.jpg"
        width="200"
        height="200"
        onError={() => {
          setMsg(`error state`)
        }}
      />
      <p id="msg">{msg}</p>
    </div>
  )
}

export default Page
