/* eslint-env jest */

import defaultLoader from '../../packages/next/src/shared/lib/image-loader'
import { imageConfigDefault } from '../../packages/next/src/shared/lib/image-config'
import { getImgProps } from '../../packages/next/src/shared/lib/get-img-props'

describe('getImgProps() unoptimized precedence', () => {
  it('uses explicit unoptimized=false to override images.unoptimized=true', () => {
    const { props, meta } = getImgProps(
      {
        alt: 'desc',
        src: '/test.png',
        width: 100,
        height: 200,
        unoptimized: false,
      },
      {
        defaultLoader,
        imgConf: { ...imageConfigDefault, unoptimized: true },
      }
    )
    expect(meta.unoptimized).toBe(false)
    expect(props.srcSet).toBeDefined()
    expect(typeof props.srcSet).toBe('string')
    expect(props.srcSet!.length).toBeGreaterThan(0)
  })

  it('inherits images.unoptimized=true when prop is not provided', () => {
    const { props, meta } = getImgProps(
      {
        alt: 'desc',
        src: '/test.png',
        width: 100,
        height: 200,
      },
      {
        defaultLoader,
        imgConf: { ...imageConfigDefault, unoptimized: true },
      }
    )
    expect(meta.unoptimized).toBe(true)
    expect(props.srcSet).toBeUndefined()
  })

  it('forces unoptimized for data URLs regardless of prop/config', () => {
    const { props, meta } = getImgProps(
      {
        alt: 'desc',
        src: 'data:image/png;base64,iVBORw0KGgo=',
        width: 10,
        height: 10,
        unoptimized: false,
      },
      {
        defaultLoader,
        imgConf: { ...imageConfigDefault, unoptimized: false },
      }
    )
    expect(meta.unoptimized).toBe(true)
    expect(props.srcSet).toBeUndefined()
  })

  it('forces unoptimized for SVG with default loader when dangerouslyAllowSVG=false', () => {
    const { props, meta } = getImgProps(
      {
        alt: 'desc',
        src: '/icon.svg',
        width: 24,
        height: 24,
        unoptimized: false,
      },
      {
        defaultLoader,
        imgConf: {
          ...imageConfigDefault,
          dangerouslyAllowSVG: false,
          unoptimized: false,
        },
      }
    )
    expect(meta.unoptimized).toBe(true)
    expect(props.srcSet).toBeUndefined()
  })

  it('allows optimizing SVG when dangerouslyAllowSVG=true and unoptimized=false', () => {
    const { props, meta } = getImgProps(
      {
        alt: 'desc',
        src: '/icon.svg',
        width: 24,
        height: 24,
        unoptimized: false,
      },
      {
        defaultLoader,
        imgConf: {
          ...imageConfigDefault,
          dangerouslyAllowSVG: true,
          unoptimized: false,
        },
      }
    )
    expect(meta.unoptimized).toBe(false)
    expect(props.srcSet).toBeDefined()
  })
})
