'use cache'

import { getSentinelValue } from '../sentinel'

export default async function Layout({ children }) {
  return (
    <html>
      <body>
        <div id="layout">
          Layout: {new Date().toISOString()} ({getSentinelValue()})
        </div>
        {children}
      </body>
    </html>
  )
}
