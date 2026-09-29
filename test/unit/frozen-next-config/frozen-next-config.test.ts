import React from 'react'
import { renderToString } from 'react-dom/server'
import cheerio from 'cheerio'
import Image from 'next/image'
import LegacyImage from 'next/legacy/image'
import {
  imageConfigDefault,
  prepareImageConfig,
  type ImageConfigComplete,
} from 'next/dist/shared/lib/image-config'
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime'
import { getImgProps } from 'next/dist/shared/lib/get-img-props'
import defaultLoader from 'next/dist/shared/lib/image-loader'
import { deepFreeze } from 'next/dist/shared/lib/deep-freeze'

function createConfig() {
  return {
    ...imageConfigDefault,
    domains: [...imageConfigDefault.domains],
    formats: [...imageConfigDefault.formats],
    remotePatterns: [...imageConfigDefault.remotePatterns],
    deviceSizes: [1080, 640],
    imageSizes: [256, 128],
    qualities: [90, 60],
  }
}

it.each(['mutable', 'frozen'] as const)(
  'generates sorted widths and lower tie quality from %s image config without mutation',
  (state) => {
    const config = createConfig()
    if (state === 'frozen') deepFreeze(config)
    const before = JSON.stringify(config)

    const { props } = getImgProps(
      { src: '/test.png', alt: 'test', fill: true },
      { defaultLoader, imgConf: config }
    )

    expect(props.srcSet).toBe(
      '/_next/image?url=%2Ftest.png&w=640&q=60 640w, /_next/image?url=%2Ftest.png&w=1080&q=60 1080w'
    )
    expect(JSON.stringify(config)).toBe(before)
  }
)

it('isolates localPatterns from different SSR contexts sharing one source', () => {
  const source = {
    ...createConfig(),
    localPatterns: [{ pathname: '**', search: '' }],
  }
  deepFreeze(source)
  const before = JSON.stringify(source)
  const permissiveContext = { localPatterns: undefined }
  const getSrcSet = (context?: Pick<ImageConfigComplete, 'localPatterns'>) =>
    getImgProps(
      { src: '/test.png?v=1', alt: 'test', fill: true },
      { defaultLoader, imgConf: prepareImageConfig(source, context) }
    ).props.srcSet

  expect(() => getSrcSet()).toThrow(
    'using a query string which is not configured'
  )
  expect(getSrcSet(permissiveContext)).toContain('w=640&q=60 640w')
  expect(() => getSrcSet()).toThrow(
    'using a query string which is not configured'
  )
  expect(JSON.stringify(source)).toBe(before)
})

function renderCandidates(
  config: ImageConfigComplete,
  legacy: boolean,
  src = '/test.png'
) {
  const image = legacy
    ? React.createElement(LegacyImage, {
        src,
        alt: 'test',
        layout: 'fill',
        loading: 'eager',
      })
    : React.createElement(Image, {
        src,
        alt: 'test',
        fill: true,
        loading: 'eager',
      })
  const html = renderToString(
    React.createElement(ImageConfigContext.Provider, { value: config }, image)
  )
  const srcSet = cheerio.load(html)('img').first().attr('srcset')
  return srcSet?.split(', ').map((candidate) => {
    const [src, width] = candidate.split(' ')
    const url = new URL(src, 'http://localhost')
    return [
      url.pathname,
      url.searchParams.get('w'),
      url.searchParams.get('q'),
      width,
    ]
  })
}

it.each(['next/image', 'next/legacy/image'])(
  'renders %s repeatedly with distinct frozen context options',
  (name) => {
    const first = { ...createConfig(), path: '/image-a' }
    const second = {
      ...createConfig(),
      path: '/image-b',
      deviceSizes: [1200, 750],
      imageSizes: [300, 150],
      qualities: [95, 55],
    }
    deepFreeze(first)
    deepFreeze(second)
    const firstBefore = JSON.stringify(first)
    const secondBefore = JSON.stringify(second)
    const legacy = name === 'next/legacy/image'

    for (let i = 0; i < 2; i++) {
      expect(renderCandidates(first, legacy)).toEqual([
        ['/image-a', '640', '60', '640w'],
        ['/image-a', '1080', '60', '1080w'],
      ])
      expect(renderCandidates(second, legacy)).toEqual([
        ['/image-b', '750', '55', '750w'],
        ['/image-b', '1200', '55', '1200w'],
      ])
    }
    expect(JSON.stringify(first)).toBe(firstBefore)
    expect(JSON.stringify(second)).toBe(secondBefore)
  }
)

it.each(['next/image', 'next/legacy/image'])(
  'uses SSR context localPatterns with %s without modifying prepared options',
  (name) => {
    const config = {
      ...createConfig(),
      localPatterns: [{ pathname: '**', search: '' }],
    }
    deepFreeze(config)
    const before = JSON.stringify(config)

    expect(() =>
      renderCandidates(config, name === 'next/legacy/image', '/test.png?v=1')
    ).toThrow('using a query string which is not configured')
    expect(JSON.stringify(config)).toBe(before)
  }
)
