import React from 'react'
import testImg from '../public/foo/test-rect.jpg'
import testImgProp from '../public/exif-rotation.jpg'
import Image from 'next/image'

import testJPG from '../public/test.jpg'
import testPNG from '../public/test.png'
import testWEBP from '../public/test.webp'
import testAVIF from '../public/test.avif'
import testSVG from '../public/test.svg'
import testGIF from '../public/test.gif'
import testBMP from '../public/test.bmp'
import testICO from '../public/test.ico'
import widePNG from '../public/wide.png'
import tallPNG from '../components/tall.png'
import superWidePNG from '../public/super-wide.png'

import TallImage from '../components/TallImage'

const blurDataURL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNM/s/wBwAFjwJgf8HDLgAAAABJRU5ErkJggg=='

export const getStaticProps = () => ({
  props: { testImgProp },
})

const Page = ({ testImgProp }) => {
  return (
    <div>
      <h1 id="page-header">Static Image</h1>
      <Image id="basic-static" src={testImg} placeholder="blur" />
      <Image id="basic-staticprop" src={testImgProp} placeholder="blur" />
      <TallImage />
      <Image
        id="defined-width-and-height"
        src={testPNG}
        height="150"
        width="150"
      />
      <Image id="defined-height-only" src={widePNG} height="350" />
      <Image id="defined-width-only" src={widePNG} width="400" />
      <Image id="require-static" src={require('../public/foo/test-rect.jpg')} />
      <Image
        id="basic-non-static"
        src="/test-rect.jpg"
        width="400"
        height="300"
      />
      <br />
      <Image id="blur-png" src={testPNG} placeholder="blur" />
      <Image id="blur-jpg" src={testJPG} placeholder="blur" />
      <Image id="blur-webp" src={testWEBP} placeholder="blur" />
      <Image id="blur-avif" src={testAVIF} placeholder="blur" />
      <Image id="blur-wide" src={widePNG} placeholder="blur" />
      <Image id="blur-tall" src={tallPNG} placeholder="blur" />
      <Image
        id="blur-super-wide"
        src={superWidePNG}
        placeholder="blur"
        width={72}
        height={16}
      />
      <Image
        id="blur-super-tall"
        src={superWidePNG}
        placeholder="blur"
        width={16}
        height={72}
      />
      <br />
      <Image id="static-svg" src={testSVG} />
      <Image id="static-gif" src={testGIF} />
      <Image id="static-bmp" src={testBMP} />
      <Image id="static-ico" src={testICO} />
      <br />
      <Image id="static-svg-fill" src={testSVG} fill />
      <Image id="static-gif-fill" src={testGIF} fill />
      <Image id="static-bmp-fill" src={testBMP} fill />
      <Image id="static-ico-fill" src={testICO} fill />
      <br />
      <Image id="blur-png-fill" src={testPNG} placeholder="blur" fill />
      <Image id="blur-jpg-fill" src={testJPG} placeholder="blur" fill />
      <Image id="blur-webp-fill" src={testWEBP} placeholder="blur" fill />
      <Image id="blur-avif-fill" src={testAVIF} placeholder="blur" fill />
      <br />
      <Image
        id="blurdataurl-fill"
        src="/test.jpg"
        placeholder="blur"
        blurDataURL={blurDataURL}
        fill
      />
      <Image
        id="blurdataurl-ratio"
        src="/test.png"
        placeholder="blur"
        blurDataURL={blurDataURL}
        width="100"
        height="200"
      />
      <br />
      <Image id="static-unoptimized" src={testJPG} unoptimized />
    </div>
  )
}

export default Page
