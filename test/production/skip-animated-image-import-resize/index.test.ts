import { createNext, FileRef } from 'e2e-utils'
import path from 'path'

describe('Skip animated image import resize', () => {
  it('should build with', async () => {
    const next = await createNext({
      files: {
        'pages/index.js': `
        import Image from 'next/image'
        import cat from '../public/cat.webp'
        export default function Home() {
            return <Image src={cat} alt="cat" />
        }`,
        'public/cat.webp': new FileRef(path.join(__dirname, 'cat.webp')),
      },
    })
    expect(true).toBe(true)
    await next.destroy()
  })
})
