import Image from 'next/legacy/image'
import testJpg from './test.jpg'

export const runtime = 'experimental-edge'

export default function LegacyEdgeLayout({ children }) {
  return (
    <>
      <h2>app-legacy-edge-layout</h2>
      <Image id="app-legacy-edge-layout" src={testJpg} quality={53} />
      {children}
    </>
  )
}
