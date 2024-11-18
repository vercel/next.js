import { StreamingText } from '../streaming-text'

export default function Layout({
  nav,
  children,
}: {
  nav: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <>
      <StreamingText static="Static in layout" dynamic="Dynamic in layout" />
      <div>{nav}</div>
      <div>{children}</div>
    </>
  )
}
