import { unstable_after as after } from 'next/server'
import { cliLog } from '../../../utils/log'

export default function Page() {
  after(() => {
    cliLog({
      source: '[page] /interrupted/throws-error',
    })
  })
  throw new Error('User error')
}
