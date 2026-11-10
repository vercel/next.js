import {
  exportUsed,
  export2Used,
  export3Used,
  export4Used,
  export5Used,
  export6Used,
} from './inner'
import { f1, pureUsed, fWithDefault } from './module'

it('export should be unused when only unused functions use it', () => {
  f1()
  expect(pureUsed).toBe(42)
  expect(fWithDefault()).toBe(42)
  if (process.env.NODE_ENV === 'production') {
    expect(exportUsed).toBe(false)
    expect(export2Used).toBe(true)
    expect(export3Used).toBe(true)
    expect(export4Used).toBe(true)
    expect(export5Used).toBe(true)
    expect(export6Used).toBe(true)
  }
  return import('./chunk')
})
