// home.test.js
import router from 'next/router'
// const router = require('next/router')
// jest.setup.js
jest.mock('next/router', () => ({
  push: jest.fn(),
  back: jest.fn(),
  events: {
    on: jest.fn(),
    off: jest.fn(),
  },
  asPath: jest.fn().mockReturnThis(),
  beforePopState: jest.fn(() => null),
  useRouter: () => ({
    push: jest.fn(),
  }),
}))

describe(`Page / Home`, () => {
  it(`call mocked`, async () => {
    console.log(router)
    expect(typeof router.useRouter).toBe('function') // mocked
  })
})
