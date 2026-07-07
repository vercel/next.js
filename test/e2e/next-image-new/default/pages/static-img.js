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
const shimmer = `data:image/svg+xml;base64,Cjxzdmcgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMzMzIiBvZmZzZXQ9IjIwJSIgLz4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iIzIyMiIgb2Zmc2V0PSI1MCUiIC8+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiMzMzMiIG9mZnNldD0iNzAlIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMzMzMiIC8+CiAgPHJlY3QgaWQ9InIiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSJ1cmwoI2cpIiAvPgogIDxhbmltYXRlIHhsaW5rOmhyZWY9IiNyIiBhdHRyaWJ1dGVOYW1lPSJ4IiBmcm9tPSItMjAwIiB0bz0iMjAwIiBkdXI9IjFzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIgIC8+Cjwvc3ZnPg==`

export const getStaticProps = () => ({
  props: { testImgProp },
})

function FillContainer({ children }) {
  // Optimized to accept the square test images. Subtracting 16px to account for
  // the default 8px body margin.
  return (
    <div style={{ position: 'relative', height: 'calc(100vw - 16px)' }}>
      {children}
    </div>
  )
}

const Page = ({ testImgProp }) => {
  return (
    <div>
      <h1 id="page-header">Static Image</h1>
      <Image id="basic-static" src={testImg} placeholder="blur" priority />
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
      <FillContainer>
        <Image id="static-svg-fill" src={testSVG} fill />
      </FillContainer>
      <FillContainer>
        <Image id="static-gif-fill" src={testGIF} fill />
      </FillContainer>
      <FillContainer>
        <Image id="static-bmp-fill" src={testBMP} fill />
      </FillContainer>
      <FillContainer>
        <Image id="static-ico-fill" src={testICO} fill />
      </FillContainer>
      <br />
      <FillContainer>
        <Image id="blur-png-fill" src={testPNG} placeholder="blur" fill />
      </FillContainer>
      <FillContainer>
        <Image id="blur-jpg-fill" src={testJPG} placeholder="blur" fill />
      </FillContainer>
      <FillContainer>
        <Image id="blur-webp-fill" src={testWEBP} placeholder="blur" fill />
      </FillContainer>
      <FillContainer>
        <Image id="blur-avif-fill" src={testAVIF} placeholder="blur" fill />
      </FillContainer>
      <br />
      <FillContainer>
        <Image
          id="blurdataurl-fill"
          src="/test.jpg"
          placeholder="blur"
          blurDataURL={blurDataURL}
          fill
        />
      </FillContainer>
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
      <br />
      <Image
        id="data-url-placeholder"
        src={testImg}
        placeholder={shimmer}
        width="200"
        height="200"
        alt=""
      />
    </div>
  )
}

export default Page
