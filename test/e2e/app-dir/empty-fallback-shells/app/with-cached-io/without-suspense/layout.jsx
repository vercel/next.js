'use cache'

import { getSentinelValue } from '../sentinel'

export default async function Layout({ children }) {
  return (
    <html>
      <body>
        <div data-testid={`layout-${getSentinelValue()}`}>
          Layout: {new Date().toISOString()}
        </div>
        {children}
      </body>
    </html>
  )
}
