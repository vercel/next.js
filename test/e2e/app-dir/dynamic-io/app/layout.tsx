import { getSentinelValue } from './getSentinelValue'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <div id="layout">{getSentinelValue()}</div>
      </body>
    </html>
  )
}
