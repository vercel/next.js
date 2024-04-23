import { unstable_after as after } from 'next/server'
import { persistentLog } from '../utils/log'

export default function AppLayout({ children }) {
  after(async () => {
    console.log('[layout] hello from after')
    persistentLog({ source: '[layout] /[id]' })
  })
  return (
    <html>
      <head>
        <title>after</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
