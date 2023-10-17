import React, { useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import testPng from '../images/test.png'

const CustomImage = React.forwardRef((props, ref) => (
  <Image
    ref={ref}
    id="img"
    src={testPng}
    width={300}
    height={300}
    alt="test img"
    {...props}
  />
))

const MotionImage = motion(CustomImage)

export default function Page() {
  const [clicked, setClicked] = useState(false)
  return (
    <MotionImage
      onClick={() => setClicked(true)}
      initial={{ opacity: 1 }}
      animate={{ opacity: clicked ? 0 : 1 }}
      transition={{ duration: 0.5 }}
    />
  )
}
