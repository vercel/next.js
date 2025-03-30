import { after, connection } from 'next/server'
import { cliLog } from '../../../utils/log'

export default async function Layout({ children }) {
  await connection()
  after(async () => {
    cliLog({ source: '[layout] /[id]' })
  })
  return <>{children}</>
}
