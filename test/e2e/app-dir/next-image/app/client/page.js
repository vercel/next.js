'use client'
import Comp from './Comp'
import Image from 'next/image'
import testPng from '../../images/test.png'

export default function ClientPage() {
  return (
    <>
      <h2>app-client-page</h2>
      <Image id="app-client-page" src={testPng} quality={60} />
      <Comp />
    </>
  )
}
