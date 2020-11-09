import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Valid TS</p>
      <Image
        id="width-and-height-num"
        src="https://via.placeholder.com/500"
        width={500}
        height={500}
      />
      <Image
        id="width-and-height-str"
        src="https://via.placeholder.com/500"
        width="500"
        height="500"
      />
      <div style={{ position: 'relative', width: 100, height: 100 }}>
        <Image
          id="layout-fill"
          src="https://via.placeholder.com/100"
          layout="fill"
        />
      </div>
      <Image
        id="quality-num"
        src="https://via.placeholder.com/500"
        quality={80}
        width={500}
        height={500}
      />
      <Image
        id="quality-str"
        src="https://via.placeholder.com/500"
        quality="80"
        width={500}
        height={500}
      />
      <Image
        id="data-protocol"
        src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
        width={100}
        height={100}
      />
      <Image
        id="object-fit-cover-position-right"
        src="https://via.placeholder.com/500"
        layout="fill"
        objectFit="cover"
        objectPosition="right"
      />
      <Image
        id="object-fit-scale-down-position-50px"
        src="https://via.placeholder.com/500"
        layout="fill"
        objectFit="scale-down"
        objectPosition="50px"
      />
      <p id="stubtext">This is valid usage of the Image component</p>
    </div>
  )
}

export default Page
