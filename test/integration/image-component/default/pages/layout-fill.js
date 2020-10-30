import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Layout Fill</p>
      <div style={{ position: 'relative', minHeight: '10vh' }}>
        <Image id="fill1" src="/wide.png" layout="fill" unsized></Image>
      </div>
      <div style={{ position: 'relative' }}>
        <Image id="fill2" src="/wide.png" layout="fill" unsized></Image>
        <Image id="fill3" src="/wide.png" layout="fill" unsized></Image>
        <Image id="fill4" src="/wide.png" layout="fill" unsized></Image>
      </div>
      <p>Layout Fill</p>
    </div>
  )
}

export default Page
