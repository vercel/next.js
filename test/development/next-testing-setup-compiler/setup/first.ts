import { beforeEach } from 'vitest'
import { value } from 'setup-project-alias'
import loaded from './value.test-data'
import { order } from './state'
if (order.length) throw new Error('setup state leaked between files')
await Promise.resolve()
order.push(value, loaded, 'first')
beforeEach(() => {
  order.push('hook')
})
