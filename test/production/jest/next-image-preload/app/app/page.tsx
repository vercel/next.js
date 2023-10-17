import React from 'react'
import Image from 'next/image'
import logo from './next.svg'

export default function MyImage() {
  return <Image alt="" src={logo} priority />
}
