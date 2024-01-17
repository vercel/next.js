/* eslint-env jest */
import { getImageProps } from 'next/image'

describe('getImageProps()', () => {
  let warningMessages: string[]
  const originalConsoleWarn = console.warn
  beforeEach(() => {
    warningMessages = []
    console.warn = (m: string) => {
      warningMessages.push(m)
    }
  })

  afterEach(() => {
    console.warn = originalConsoleWarn
  })
  it('should return props in correct order', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
    })
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'lazy'],
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
  it('should handle priority', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
      priority: true,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['fetchPriority', 'high'],
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
  it('should handle quality', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
      quality: 50,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'lazy'],
      ['width', 100],
      ['height', 200],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      [
        'srcSet',
        '/_next/image?url=%2Ftest.png&w=128&q=50 1x, /_next/image?url=%2Ftest.png&w=256&q=50 2x',
      ],
      ['src', '/_next/image?url=%2Ftest.png&w=256&q=50'],
    ])
  })
  it('should handle loading eager', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
      loading: 'eager',
    })
    expect(warningMessages).toStrictEqual([])
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
  it('should handle sizes', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
      sizes: '100vw',
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'lazy'],
      ['width', 100],
      ['height', 200],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      ['sizes', '100vw'],
      [
        'srcSet',
        '/_next/image?url=%2Ftest.png&w=640&q=75 640w, /_next/image?url=%2Ftest.png&w=750&q=75 750w, /_next/image?url=%2Ftest.png&w=828&q=75 828w, /_next/image?url=%2Ftest.png&w=1080&q=75 1080w, /_next/image?url=%2Ftest.png&w=1200&q=75 1200w, /_next/image?url=%2Ftest.png&w=1920&q=75 1920w, /_next/image?url=%2Ftest.png&w=2048&q=75 2048w, /_next/image?url=%2Ftest.png&w=3840&q=75 3840w',
      ],
      ['src', '/_next/image?url=%2Ftest.png&w=3840&q=75'],
    ])
  })
  it('should handle fill', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      fill: true,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'lazy'],
      ['decoding', 'async'],
      [
        'style',
        {
          bottom: 0,
          color: 'transparent',
          height: '100%',
          left: 0,
          objectFit: undefined,
          objectPosition: undefined,
          position: 'absolute',
          right: 0,
          top: 0,
          width: '100%',
        },
      ],
      ['sizes', '100vw'],
      [
        'srcSet',
        '/_next/image?url=%2Ftest.png&w=640&q=75 640w, /_next/image?url=%2Ftest.png&w=750&q=75 750w, /_next/image?url=%2Ftest.png&w=828&q=75 828w, /_next/image?url=%2Ftest.png&w=1080&q=75 1080w, /_next/image?url=%2Ftest.png&w=1200&q=75 1200w, /_next/image?url=%2Ftest.png&w=1920&q=75 1920w, /_next/image?url=%2Ftest.png&w=2048&q=75 2048w, /_next/image?url=%2Ftest.png&w=3840&q=75 3840w',
      ],
      ['src', '/_next/image?url=%2Ftest.png&w=3840&q=75'],
    ])
  })
  it('should handle style', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
      style: { maxWidth: '100%', height: 'auto' },
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'lazy'],
      ['width', 100],
      ['height', 200],
      ['decoding', 'async'],
      ['style', { color: 'transparent', maxWidth: '100%', height: 'auto' }],
      [
        'srcSet',
        '/_next/image?url=%2Ftest.png&w=128&q=75 1x, /_next/image?url=%2Ftest.png&w=256&q=75 2x',
      ],
      ['src', '/_next/image?url=%2Ftest.png&w=256&q=75'],
    ])
  })
  it('should handle loader', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
      loader: ({ src, width, quality }) =>
        `https://example.com${src}?w=${width}&q=${quality || 75}`,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'lazy'],
      ['width', 100],
      ['height', 200],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      [
        'srcSet',
        'https://example.com/test.png?w=128&q=75 1x, https://example.com/test.png?w=256&q=75 2x',
      ],
      ['src', 'https://example.com/test.png?w=256&q=75'],
    ])
  })
  it('should handle arbitrary props', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      src: '/test.png',
      width: 100,
      height: 200,
      // @ts-ignore - testing arbitrary props
      foo: true,
      bar: 42,
      baz: 'str',
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['foo', true],
      ['bar', 42],
      ['baz', 'str'],
      ['loading', 'lazy'],
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
