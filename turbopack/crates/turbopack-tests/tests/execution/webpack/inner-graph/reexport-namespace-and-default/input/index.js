import { exportDefaultUsed as export1 } from './package1/script'
import { exportDefaultUsed as export2 } from './package1/script2'
import { exportDefaultUsed as export3 } from './package2/script'

it('should load module correctly', () => {
  require('./module')
})

if (process.env.NODE_ENV === 'production') {
  it('default export should be unused', () => {
    expect(export1).toBe(false)
    expect(export2).toBe(false)
  })
}

it('default export should be used', () => {
  expect(export3).toBe(true)
})
