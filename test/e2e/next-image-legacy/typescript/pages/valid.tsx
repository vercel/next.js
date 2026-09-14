import React from 'react'
import Image from 'next/legacy/image'
import testTall from '../public/tall.png'
import svg from '../public/test.svg'
import avif from '../public/test.avif'
import { ImageCard } from '../components/image-card'
import { DynamicSrcImage } from '../components/image-dynamic-src'

const Page = () => {
  return (
    <div>
      <p>Valid TS</p>
      <Image
        id="width-and-height-num"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width={500}
        height={500}
      />
      <Image
        id="width-and-height-str"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width="500"
        height="500"
      />
      <div style={{ position: 'relative', width: 100, height: 100 }}>
        <Image
          id="layout-fill"
          src="https://image-optimization-test.vercel.app/test.jpg"
          layout="fill"
        />
      </div>
      <Image
        id="quality-num"
        src="https://image-optimization-test.vercel.app/test.jpg"
        quality={80}
        width={500}
        height={500}
      />
      <Image
        id="quality-str"
        src="https://image-optimization-test.vercel.app/test.jpg"
        quality="80"
        width={500}
        height={500}
      />
      <Image
        id="numeric-string-types"
        alt="numeric-string-types"
        src="https://image-optimization-test.vercel.app/test.jpg"
        quality="80"
        width="500"
        height="500"
      />
      <Image
        id="data-protocol"
        src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
        width={100}
        height={100}
      />
      <Image
        id="object-fit-cover-position-right"
        src="https://image-optimization-test.vercel.app/test.jpg"
        layout="fill"
        objectFit="cover"
        objectPosition="right"
      />
      <Image
        id="object-fit-scale-down-position-50px"
        src="https://image-optimization-test.vercel.app/test.jpg"
        layout="fill"
        objectFit="scale-down"
        objectPosition="50px"
      />
      <Image
        id="placeholder-and-blur-data-url"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width={500}
        height={500}
        placeholder="blur"
        blurDataURL="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
      />
      <Image id="no-width-and-height" src={testTall} />
      <Image
        id="object-src-with-placeholder"
        src={testTall}
        placeholder="blur"
      />
      <Image id="object-src-with-svg" src={svg} />
      <Image id="object-src-with-avif" src={avif} />
      <Image
        id="fill-with-unused-width-height"
        src="https://image-optimization-test.vercel.app/test.jpg"
        layout="fill"
        width={100}
        height={100}
      />
      <ImageCard
        id="image-card"
        src="https://image-optimization-test.vercel.app/test.jpg"
      />
      <DynamicSrcImage
        id="dynamic-src"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width={400}
        height={400}
      />
      <p id="stubtext">This is valid usage of the Image component</p>
    </div>
  )
}

export default Page
