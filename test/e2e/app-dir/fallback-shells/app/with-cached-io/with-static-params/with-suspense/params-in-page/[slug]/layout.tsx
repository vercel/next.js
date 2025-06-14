'use cache'

import { getSentinelValue } from '../../../../sentinel'

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <p>This layout is explicitly not reading params.</p>
      <div id="layout">
        Layout: {new Date().toISOString()} ({getSentinelValue()})
      </div>
      <div>{children}</div>
    </div>
  )
}
