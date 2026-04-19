import Image from 'next/legacy/image'
import testPng from '../../images/test.png'

export const runtime = 'edge'

export default function LegacyEdgeLayout({ children }) {
  return (
    <>
      <h2>app-legacy-edge-layout</h2>
      <Image id="app-legacy-edge-layout" src={testPng} loading="eager" />
      {children}
    </>
  )
}
