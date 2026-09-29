import { imageConfigDefault } from 'next/dist/shared/lib/image-config'
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
