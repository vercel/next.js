import { unstable_after as after } from 'next/server'
import { cliLog } from '../../utils/log'

export default function Layout({ children }) {
  after(async () => {
    cliLog({ source: '[layout] /[id]' })
  })
  return <>{children}</>
}
