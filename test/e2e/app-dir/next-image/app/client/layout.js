'use client'
import Image from 'next/image'
import testPng from '../../images/test.png'

export default function ClientLayout({ children }) {
  return (
    <>
      <h2>app-client-layout</h2>
      <Image id="app-client-layout" src={testPng} quality={55} />
      {children}
    </>
  )
}
