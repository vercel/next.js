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

  it('should have correct type for props', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
    })

    expect(props.alt).toBeString()
    expect(props.id).toBeString()
    expect(props.loading).toBeString()

    expect(props.width).toBeNumber()
    expect(props.height).toBeNumber()

    expect(props.decoding).toBeString()
    expect(props.style).toBeObject()
    expect(props.style.color).toBeString()
    expect(props.src).toBeString()
    expect(props.srcSet).toBeString()
  })

  it('should handle preload', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
      preload: true,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
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

  it('should error when both priority and preload are used', async () => {
    expect(() =>
      getImageProps({
        alt: 'a nice desc',
        id: 'my-image',
        src: '/test.png',
        width: 100,
        height: 200,
        preload: true,
        priority: true,
      })
    ).toThrow(
      'Image with src "/test.png" has both "preload" and "priority" properties. Only "preload" should be used.'
    )
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
  it('should handle fetchPriority', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
      fetchPriority: 'high',
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'lazy'],
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
  it('should handle quality coercion from 50 to 75', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
      quality: 50,
    })
    expect(warningMessages).toStrictEqual([
      'Image with src "/test.png" is using quality "50" which is not configured in images.qualities [75]. Please update your config to [50, 75].\nRead more: https://nextjs.org/docs/messages/next-image-unconfigured-qualities',
    ])
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
  it('should handle quality exact match config and not warn', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
      quality: 75,
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
        '/_next/image?url=%2Ftest.png&w=128&q=75 1x, /_next/image?url=%2Ftest.png&w=256&q=75 2x',
      ],
      ['src', '/_next/image?url=%2Ftest.png&w=256&q=75'],
    ])
  })
  it('should handle quality as a string and not warn', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 100,
      height: 200,
      quality: '75',
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
        '/_next/image?url=%2Ftest.png&w=128&q=75 1x, /_next/image?url=%2Ftest.png&w=256&q=75 2x',
      ],
      ['src', '/_next/image?url=%2Ftest.png&w=256&q=75'],
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
  it('should handle 16px image', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 16,
      height: 16,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'lazy'],
      ['width', 16],
      ['height', 16],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      ['srcSet', '/_next/image?url=%2Ftest.png&w=32&q=75 1x'],
      ['src', '/_next/image?url=%2Ftest.png&w=32&q=75'],
    ])
  })
  it('should handle 32px image', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 32,
      height: 32,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'lazy'],
      ['width', 32],
      ['height', 32],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      [
        'srcSet',
        '/_next/image?url=%2Ftest.png&w=32&q=75 1x, /_next/image?url=%2Ftest.png&w=64&q=75 2x',
      ],
      ['src', '/_next/image?url=%2Ftest.png&w=64&q=75'],
    ])
  })
  it('should handle 256px image', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 256,
      height: 256,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'lazy'],
      ['width', 256],
      ['height', 256],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      [
        'srcSet',
        '/_next/image?url=%2Ftest.png&w=256&q=75 1x, /_next/image?url=%2Ftest.png&w=640&q=75 2x',
      ],
      ['src', '/_next/image?url=%2Ftest.png&w=640&q=75'],
    ])
  })
  it('should handle 512px image', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 512,
      height: 512,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'lazy'],
      ['width', 512],
      ['height', 512],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      [
        'srcSet',
        '/_next/image?url=%2Ftest.png&w=640&q=75 1x, /_next/image?url=%2Ftest.png&w=1080&q=75 2x',
      ],
      ['src', '/_next/image?url=%2Ftest.png&w=1080&q=75'],
    ])
  })
  it('should handle 3072px image', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      id: 'my-image',
      src: '/test.png',
      width: 3072,
      height: 3072,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['id', 'my-image'],
      ['loading', 'lazy'],
      ['width', 3072],
      ['height', 3072],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      ['srcSet', '/_next/image?url=%2Ftest.png&w=3840&q=75 1x'],
      ['src', '/_next/image?url=%2Ftest.png&w=3840&q=75'],
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
  it('should override src', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      src: '/test.png',
      overrideSrc: '/override.png',
      width: 100,
      height: 200,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['loading', 'lazy'],
      ['width', 100],
      ['height', 200],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      [
        'srcSet',
        '/_next/image?url=%2Ftest.png&w=128&q=75 1x, /_next/image?url=%2Ftest.png&w=256&q=75 2x',
      ],
      ['src', '/override.png'],
    ])
  })
  it('should handle decoding=sync', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      src: '/test.png',
      decoding: 'sync',
      width: 100,
      height: 200,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['loading', 'lazy'],
      ['width', 100],
      ['height', 200],
      ['decoding', 'sync'],
      ['style', { color: 'transparent' }],
      [
        'srcSet',
        '/_next/image?url=%2Ftest.png&w=128&q=75 1x, /_next/image?url=%2Ftest.png&w=256&q=75 2x',
      ],
      ['src', '/_next/image?url=%2Ftest.png&w=256&q=75'],
    ])
  })
  it('should auto unoptimized for relative svg', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      src: '/test.svg',
      width: 100,
      height: 200,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['loading', 'lazy'],
      ['width', 100],
      ['height', 200],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      ['src', '/test.svg'],
    ])
  })
  it('should auto unoptimized for absolute svg', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      src: 'https://example.com/test.svg',
      width: 100,
      height: 200,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['loading', 'lazy'],
      ['width', 100],
      ['height', 200],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      ['src', 'https://example.com/test.svg'],
    ])
  })
  it('should auto unoptimized for absolute svg with query', async () => {
    const { props } = getImageProps({
      alt: 'a nice desc',
      src: 'https://example.com/test.svg?v=1',
      width: 100,
      height: 200,
    })
    expect(warningMessages).toStrictEqual([])
    expect(Object.entries(props)).toStrictEqual([
      ['alt', 'a nice desc'],
      ['loading', 'lazy'],
      ['width', 100],
      ['height', 200],
      ['decoding', 'async'],
      ['style', { color: 'transparent' }],
      ['src', 'https://example.com/test.svg?v=1'],
    ])
  })
  it('should add query string for imported local image when NEXT_DEPLOYMENT_ID defined', async () => {
    try {
      process.env.NEXT_DEPLOYMENT_ID = 'dpl_123'
      const { props } = getImageProps({
        alt: 'a nice desc',
        src: '/_next/static/media/test.abc123.png',
        width: 100,
        height: 200,
      })
      expect(warningMessages).toStrictEqual([])
      expect(Object.entries(props)).toStrictEqual([
        ['alt', 'a nice desc'],
        ['loading', 'lazy'],
        ['width', 100],
        ['height', 200],
        ['decoding', 'async'],
        ['style', { color: 'transparent' }],
        [
          'srcSet',
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.abc123.png&w=128&q=75&dpl=dpl_123 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.abc123.png&w=256&q=75&dpl=dpl_123 2x',
        ],
        [
          'src',
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.abc123.png&w=256&q=75&dpl=dpl_123',
        ],
      ])
    } finally {
      delete process.env.NEXT_DEPLOYMENT_ID
    }
  })
  it('should not add query string for relative local image when NEXT_DEPLOYMENT_ID defined', async () => {
    try {
      process.env.NEXT_DEPLOYMENT_ID = 'dpl_123'
      const { props } = getImageProps({
        alt: 'a nice desc',
        src: '/test.png',
        width: 100,
        height: 200,
      })
      expect(warningMessages).toStrictEqual([])
      expect(Object.entries(props)).toStrictEqual([
        ['alt', 'a nice desc'],
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
    } finally {
      delete process.env.NEXT_DEPLOYMENT_ID
    }
  })
  it('should not add query string for absolute remote image when NEXT_DEPLOYMENT_ID defined', async () => {
    try {
      process.env.NEXT_DEPLOYMENT_ID = 'dpl_123'
      const { props } = getImageProps({
        alt: 'a nice desc',
        src: 'http://example.com/test.png',
        width: 100,
        height: 200,
      })
      expect(warningMessages).toStrictEqual([])
      expect(Object.entries(props)).toStrictEqual([
        ['alt', 'a nice desc'],
        ['loading', 'lazy'],
        ['width', 100],
        ['height', 200],
        ['decoding', 'async'],
        ['style', { color: 'transparent' }],
        [
          'srcSet',
          '/_next/image?url=http%3A%2F%2Fexample.com%2Ftest.png&w=128&q=75 1x, /_next/image?url=http%3A%2F%2Fexample.com%2Ftest.png&w=256&q=75 2x',
        ],
        [
          'src',
          '/_next/image?url=http%3A%2F%2Fexample.com%2Ftest.png&w=256&q=75',
        ],
      ])
    } finally {
      delete process.env.NEXT_DEPLOYMENT_ID
    }
  })
})
