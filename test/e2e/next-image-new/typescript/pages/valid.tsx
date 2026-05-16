import React from 'react'
import Image from 'next/image'
import testTall from '../public/tall.png'
import svg from '../public/test.svg'
import avif from '../public/test.avif'
import { ImageCard } from '../components/image-card'
import { DynamicSrcImage } from '../components/image-dynamic-src'
import { ImageWithLoader } from '../components/image-with-loader'

const Page = () => {
  return (
    <div>
      <p>Valid TS</p>
      <Image
        id="width-and-height-num"
        alt="width-and-height-num"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width={500}
        height={500}
      />
      <Image
        id="width-and-height-str"
        alt="width-and-height-str"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width="500"
        height="500"
      />
      <Image
        id="fill-no-width-and-height"
        src="https://image-optimization-test.vercel.app/test.jpg"
        fill
        alt=""
      />
      <Image
        id="quality-num"
        src="https://image-optimization-test.vercel.app/test.jpg"
        quality={80}
        width={500}
        height={500}
        alt=""
      />
      <Image
        id="quality-str"
        alt="quality-str"
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
        alt="data-protocol"
        src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
        width={100}
        height={100}
      />
      <Image
        id="placeholder-and-blur-data-url"
        alt="placeholder-and-blur-data-url"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width={500}
        height={500}
        placeholder="blur"
        blurDataURL="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
      />
      <Image
        id="no-width-and-height"
        alt="no-width-and-height"
        src={testTall}
      />
      <Image
        id="object-src-with-placeholder"
        alt="object-src-with-placeholder"
        src={testTall}
        placeholder="blur"
      />
      <Image id="object-src-with-svg" alt="object-src-with-svg" src={svg} />
      <Image id="object-src-with-avif" alt="object-src-with-avif" src={avif} />
      <ImageCard
        id="image-card"
        alt="image-card"
        src="https://image-optimization-test.vercel.app/test.jpg"
      />
      <DynamicSrcImage
        id="dynamic-src"
        alt="dynamic-src"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width={400}
        height={400}
      />
      <ImageWithLoader
        id="image-with-loader"
        alt="image-with-loader"
        src="test.jpg"
        width={300}
        height={300}
      />
      <p id="stubtext">This is valid usage of the Image component</p>
    </div>
  )
}

export default Page
