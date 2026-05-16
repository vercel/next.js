'use cache'

import { getSentinelValue } from '../sentinel'

export default async function Layout({ children }) {
  return (
    <html>
      <body>
        <div id="root-layout">
          Root Layout: {new Date().toISOString()} ({getSentinelValue()})
        </div>
        <p>This page does define some static params.</p>
        {children}
      </body>
    </html>
  )
}
