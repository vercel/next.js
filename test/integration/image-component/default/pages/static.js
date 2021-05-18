import React from 'react'
import testImg from '../public/foo/test-rect.jpg'
import Image from 'next/image'

import testJPG from '../public/test.jpg'
import testPNG from '../public/test.png'
import testSVG from '../public/test.svg'
import testGIF from '../public/test.gif'

const testFiles = [testJPG, testPNG, testSVG, testGIF]

const Page = () => {
  return (
    <div>
      <h1 id="page-header">Static Image</h1>
      <Image id="basic-static" src={testImg} layout="fixed" />
      <Image
        id="require-static"
        src={require('../public/foo/test-rect.jpg')}
        layout="fixed"
      />
      <Image
        id="new-url-static"
        src={new URL('../public/foo/test.gif', import.meta.url)}
        layout="fixed"
      />
      <Image
        id="basic-non-static"
        src="/test-rect.jpg"
        width="400"
        height="300"
        layout="fixed"
      />
      {testFiles.map((f, i) => (
        <Image id={`format-test-${i}`} key={i} src={f} layout="fixed" />
      ))}
    </div>
  )
}

export default Page
