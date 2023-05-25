import Image from 'next/legacy/image'
import testJpg from './test.jpg'

export default function LegacyLayout({ children }) {
  return (
    <>
      <h2>app-legacy-layout</h2>
      <Image id="app-legacy-layout" src={testJpg} quality={50} />
      {children}
    </>
  )
}
