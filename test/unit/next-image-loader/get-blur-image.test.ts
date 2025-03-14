/* eslint-env jest */
import { getBlurImage } from 'next/dist/build/webpack/loaders/next-image-loader/blur'
import { readFile } from 'fs-extra'
import { join } from 'path'

const getImage = (filepath) => readFile(join(__dirname, filepath))

const tracing = () => ({
  traceFn: (fn, ...args) => fn(...args),
  traceAsyncFn: (fn, ...args) => fn(...args),
})

const context = { basePath: '', outputPath: '', isDev: false, tracing }

describe('getBlurImage', () => {
  it('should return image for jpg', async () => {
    const buffer = await getImage('./images/test.jpg')
    const result = await getBlurImage(
      buffer,
      'jpeg',
      { width: 400, height: 400 },
      context
    )
    expect(result).toBeObject()
    expect(result.dataURL).toBeString()
  })
  it('should return undefined for animated webp', async () => {
    const buffer = await getImage('./images/animated.webp')
    const result = await getBlurImage(
      buffer,
      'webp',
      { width: 400, height: 400 },
      context
    )
    expect(result).toBeObject()
    expect(result.dataURL).toBeUndefined()
  })
  it.each([
    {
      description: 'default',
      config: {},
      expected: '/_next/image?url=%2Fimage.jpg&w=8&q=70',
    },
    {
      description: 'with nextUrlServerPrefix',
      config: { nextUrlServerPrefix: '/my-server-prefix' },
      expected: '/my-server-prefix/_next/image?url=%2Fimage.jpg&w=8&q=70',
    },
    {
      description: 'with nextUrlServerPrefix and basePath',
      config: {
        nextUrlServerPrefix: '/my-server-prefix',
        basePath: '/my-base-path',
      },
      expected:
        '/my-base-path/my-server-prefix/_next/image?url=%2Fimage.jpg&w=8&q=70',
    },
    {
      description: 'with basePath',
      config: {
        basePath: '/my-base-path',
      },
      expected: '/my-base-path/_next/image?url=%2Fimage.jpg&w=8&q=70',
    },
  ])(
    'should return image correct image $description',
    async ({ config, expected }) => {
      const buffer = await getImage('./images/test.jpg')
      const result = await getBlurImage(
        buffer,
        'jpeg',
        { width: 400, height: 400 },
        {
          basePath: '',
          outputPath: '/image.jpg',
          isDev: true,
          tracing,
          nextUrlServerPrefix: '',
          ...config,
        }
      )
      expect(result.dataURL).toEqual(expected)
      expect(result).toBeObject()
      expect(result.dataURL).toBeString()
    }
  )
})
