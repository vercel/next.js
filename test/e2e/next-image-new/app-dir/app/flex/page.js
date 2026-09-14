'use client'
import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Hello World</p>
      <Image id="basic-image" src="/test.jpg" width={400} height={400}></Image>
      <p id="stubtext">This is the index page</p>
      <style jsx>{`
        div {
          display: flex;
        }
      `}</style>
    </div>
  )
}

export default Page
