import React from 'react'
import { renderToString } from 'react-dom/server'
import Image, { getImageProps } from 'next/image'
import LegacyImage from 'next/legacy/image'
import { getImageConfig } from 'next/dist/shared/lib/image-config-runtime'
import {
  imageConfigDefault,
  prepareImageConfig,
} from 'next/dist/shared/lib/image-config'
import { getImgProps } from 'next/dist/shared/lib/get-img-props'
import defaultLoader from 'next/dist/shared/lib/image-loader'
import { deepFreeze } from 'next/dist/shared/lib/deep-freeze'

jest.mock('next/dist/shared/lib/image-config-runtime', () => ({
  getImageConfig: jest.fn(),
}))

const mockedGetImageConfig = jest.mocked(getImageConfig)

const configStates = [
  'mutable',
  'deviceSizes frozen',
  'qualities frozen',
  'deeply frozen',
] as const

describe.each(configStates)('image config sorting (%s)', (state) => {
  function createConfig() {
    const config = {
      ...imageConfigDefault,
      domains: [...imageConfigDefault.domains],
      formats: [...imageConfigDefault.formats],
      remotePatterns: [...imageConfigDefault.remotePatterns],
      deviceSizes: [1080, 640],
      imageSizes: [256, 128],
      qualities: [90, 60],
    }
    if (state === 'deviceSizes frozen') Object.freeze(config.deviceSizes)
    if (state === 'qualities frozen') Object.freeze(config.qualities)
    if (state === 'deeply frozen') deepFreeze(config)
    return config
  }

  it.each(['next/image', 'next/legacy/image'])(
    'renders %s with sorted widths and closest quality',
    (name) => {
      const config = createConfig()
      mockedGetImageConfig.mockReturnValue(prepareImageConfig(config))
      const before = JSON.stringify(config)
      const commonProps = {
        src: '/test.png',
        alt: 'test',
        loading: 'eager' as const,
      }
      const html = renderToString(
        name === 'next/image'
          ? React.createElement(Image, { ...commonProps, fill: true })
          : React.createElement(LegacyImage, {
              ...commonProps,
              layout: 'fill',
            })
      )
      expect(html).toContain(
        '/_next/image?url=%2Ftest.png&amp;w=640&amp;q=60 640w, /_next/image?url=%2Ftest.png&amp;w=1080&amp;q=60 1080w'
      )
      expect(JSON.stringify(config)).toBe(before)
    }
  )

  it('generates image props with sorted widths and closest quality', () => {
    const config = createConfig()
    const before = JSON.stringify(config)
    const { props } = getImgProps(
      { src: '/test.png', alt: 'test', fill: true },
      { defaultLoader, imgConf: prepareImageConfig(config) }
    )
    expect(props.srcSet).toBe(
      '/_next/image?url=%2Ftest.png&w=640&q=60 640w, /_next/image?url=%2Ftest.png&w=1080&q=60 1080w'
    )
    expect(JSON.stringify(config)).toBe(before)
  })

  it('generates public image props from frozen options without mutation', () => {
    const config = createConfig()
    mockedGetImageConfig.mockReturnValue(prepareImageConfig(config))
    const before = JSON.stringify(config)
    const { props } = getImageProps({
      src: '/test.png',
      alt: 'test',
      fill: true,
    })
    expect(props.srcSet).toBe(
      '/_next/image?url=%2Ftest.png&w=640&q=60 640w, /_next/image?url=%2Ftest.png&w=1080&q=60 1080w'
    )
    expect(JSON.stringify(config)).toBe(before)
  })
})

it('uses the runtime output mode for public image props validation', () => {
  mockedGetImageConfig.mockReturnValue(
    prepareImageConfig({ ...imageConfigDefault, output: 'export' })
  )
  expect(() =>
    getImageProps({ src: '/test.png', alt: 'test', width: 100, height: 100 })
  ).toThrow('Image Optimization using the default loader is not compatible')
})
