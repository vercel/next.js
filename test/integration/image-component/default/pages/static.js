import React from 'react'
import testImg from '../public/foo/test-rect.jpg'
import Image from 'next/image'

import testJPG from '../public/test.jpg'
import testPNG from '../public/test.png'
import testSVG from '../public/test.svg'
import testGIF from '../public/test.gif'
import testBMP from '../public/test.bmp'
import testICO from '../public/test.ico'
import testWEBP from '../public/test.webp'

import TallImage from '../components/TallImage'
const testFiles = [
  testJPG,
  testPNG,
  testSVG,
  testGIF,
  testBMP,
  testICO,
  testWEBP,
]

const Page = () => {
  return (
    <div>
      <h1 id="page-header">Static Image</h1>
      <Image
        id="basic-static"
        src={testImg}
        layout="fixed"
        placeholder="blur"
      />
      <TallImage />
      <Image
        id="defined-size-static"
        src={testPNG}
        layout="fixed"
        height="200"
        width="200"
      />
      <Image id="require-static" src={require('../public/foo/test-rect.jpg')} />
      <Image
        id="basic-non-static"
        src="/test-rect.jpg"
        width="400"
        height="300"
      />
      {testFiles.map((f, i) => (
        <Image id={`format-test-${i}`} key={i} src={f} placeholder="blur" />
      ))}
    </div>
  )
}

export default Page
