import Image from 'next/image'
import { img } from '../components/img'
import broken from '../public/broken.jpeg'
import svg from '../public/test.svg'
import brokenSvg from '../public/broken.svg'
import { useTestHarness } from '@turbo/pack-test-harness'

export default function Home() {
  useTestHarness(runTests)

  return (
    <>
      <Image
        id="imported"
        alt="test imported image"
        src={img}
        placeholder="blur"
      />
      <Image id="svg" alt="test svg image" src={svg} />
      <Image
        id="local"
        alt="test src image"
        src="/triangle-black.png"
        width="116"
        height="100"
      />
      <Image
        id="broken"
        alt="test imported broken image"
        src={broken}
        placeholder="blur"
      />
      <Image
        id="broken-svg"
        alt="test imported broken svg image"
        src={brokenSvg}
      />
    </>
  )
}

function runTests() {
  it('should return image size', () => {
    expect(img).toHaveProperty('width', 116)
    expect(img).toHaveProperty('height', 100)
  })

  it('should return image size for svg', () => {
    expect(svg).toHaveProperty('width', 400)
    expect(svg).toHaveProperty('height', 400)
  })

  it('should return fake image size for broken images', () => {
    expect(broken).toHaveProperty('width', 100)
    expect(broken).toHaveProperty('height', 100)
    expect(brokenSvg).toHaveProperty('width', 100)
    expect(brokenSvg).toHaveProperty('height', 100)
  })

  it('should have blur placeholder', () => {
    expect(img).toHaveProperty(
      'blurDataURL',
      expect.stringMatching(/^data:image\/png;base64/)
    )
    expect(img).toHaveProperty('blurWidth', 8)
    expect(img).toHaveProperty('blurHeight', 7)
  })

  it('should not have blur placeholder for svg', () => {
    expect(svg).toHaveProperty('blurDataURL', null)
    expect(svg).toHaveProperty('blurWidth', 0)
    expect(svg).toHaveProperty('blurHeight', 0)
  })

  it('should have fake blur placeholder for broken images', () => {
    expect(broken).toHaveProperty(
      'blurDataURL',
      expect.stringContaining('data:')
    )
    expect(broken).toHaveProperty('blurWidth', 1)
    expect(broken).toHaveProperty('blurHeight', 1)
  })

  it('should link to imported image', async () => {
    const img = document.querySelector('#imported')
    expect(img.src).toContain(encodeURIComponent('_next/static/assets'))

    const res = await fetch(img.src)
    expect(res.status).toBe(200)
  })

  it('should link to imported svg image', async () => {
    const img = document.querySelector('#svg')
    expect(img.src).toContain('_next/static/assets')

    const res = await fetch(img.src)
    expect(res.status).toBe(200)
  })

  it('should link to local src image', async () => {
    const img = document.querySelector('#local')
    expect(img.src).toContain('triangle-black')

    const res = await fetch(img.src)
    expect(res.status).toBe(200)
  })

  it('should link to imported broken image', async () => {
    const img = document.querySelector('#broken')
    expect(img.src).toContain(encodeURIComponent('_next/static/assets'))

    const res = await fetch(img.src)
    expect(res.status).toBe(404)
  })

  it('should link to imported broken svg image', async () => {
    const img = document.querySelector('#broken-svg')
    expect(img.src).toContain('_next/static/assets')

    const res = await fetch(img.src)
    expect(res.status).toBe(200)
  })
}
