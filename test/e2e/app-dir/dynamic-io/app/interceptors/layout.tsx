import { getSentinelValue } from '../getSentinelValue'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div id="inner-layout">{getSentinelValue()}</div>
      <div id="children">{children}</div>
    </>
  )
}
