/* eslint-env jest */
import { unstable_getImgProps } from 'next/image'

describe('getImgProps()', () => {
  it('should get props', async () => {
    const { props } = unstable_getImgProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
      loading: 'eager',
    })
    // order matters here
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'eager'],
      ['width', 100],
      ['height', 200],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      [
        'srcSet',
        '/_next/image?url=%2Ftest.png&w=128&q=75 1x, /_next/image?url=%2Ftest.png&w=256&q=75 2x',
      ],
      ['src', '/_next/image?url=%2Ftest.png&w=256&q=75'],
    ])
  })
})
