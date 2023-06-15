'use client'
import React, { useState } from 'react'
import Image from 'next/image'

const Page = () => {
  const [toggled, setToggled] = useState(false)
  return (
    <div>
      <p>Update Page</p>
      <Image
        id="update-image"
        src={toggled ? '/test.png' : '/test.jpg'}
        width="400"
        height="400"
      ></Image>
      <p id="stubtext">This is the index page</p>
      <button id="toggle" onClick={() => setToggled(true)}>
        Toggle
      </button>
    </div>
  )
}

export default Page
