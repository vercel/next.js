import React from 'react'
import { getImageProps } from 'next/image'
import testJpg from '../public/test.jpg'

const Page = () => {
  const { props: img1 } = getImageProps({
    id: 'internal-image',
    src: '/test.png',
    width: 400,
    height: 400,
  })
  const { props: img2 } = getImageProps({
    id: 'static-image',
    src: testJpg,
    width: 400,
    height: 400,
  })
  const { props: img3 } = getImageProps({
    id: 'external-image',
    src: 'https://image-optimization-test.vercel.app/test.jpg',
    width: 400,
    height: 400,
  })
  const { props: img4 } = getImageProps({
    id: 'eager-image',
    src: '/test.webp',
    width: 400,
    height: 400,
    loading: 'eager',
  })
  return (
    <div>
      <h1>Unoptimized Config</h1>
      <p>Scroll down...</p>
      <div style={{ height: '1000vh' }} />
      <img {...img1} />
      <br />
      <img {...img2} />
      <br />
      <img {...img3} />
      <div style={{ height: '1000vh' }} />
      <img {...img4} />
    </div>
  )
}

export default Page
