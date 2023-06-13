/* eslint-env jest */
import { unstable_getImgProps } from 'next/image'

describe('Image rendering', () => {
  it('should render Image on its own', async () => {
    const { props } = unstable_getImgProps({
      alt: 'a nice image',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 100,
      loading: 'eager',
    })
    // order matters here
    expect(props).toStrictEqual({
      alt: 'a nice image',
      id: 'my-image',
      loading: 'eager',
      width: 100,
      height: 100,
      decoding: 'async',
      style: { color: 'transparent' },
      srcSet:
        '/_next/image?url=%2Ftest.png&w=128&q=75 1x, /_next/image?url=%2Ftest.png&w=256&q=75 2x',
      src: '/_next/image?url=%2Ftest.png&w=256&q=75',
    })
  })
})
