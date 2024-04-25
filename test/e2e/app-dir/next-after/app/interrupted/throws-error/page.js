import { unstable_after as after } from 'next/server'
import { persistentLog } from '../../../utils/log'

export default function Page() {
  after(() => {
    persistentLog({
      source: '[page] /interrupted/throws-error',
    })
  })
  throw new Error('User error')
}
