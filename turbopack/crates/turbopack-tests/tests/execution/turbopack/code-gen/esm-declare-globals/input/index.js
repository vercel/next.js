import './module.js'

const require = () => 'result'
const __dirname = 'something'
const __filename = 'something/else'

it('should allow declaring CJS globals in ESM', () => {
  expect(require()).toBe('result')
  expect(__dirname).toBe('something')
  expect(__filename).toBe('something/else')
})
