import { unstable_after as after } from 'next/server'
import { persistentLog } from '../../utils/log'

export default function Layout({ children }) {
  after(async () => {
    persistentLog({ source: '[layout] /[id]' })
  })
  return <>{children}</>
}
