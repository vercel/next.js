import img from './vercel.svg'

it('exports the content-hashed URL of an imported static asset', () => {
  expect(img).toMatch(/^\/vercel\.[\w-]+\.svg$/)
})
