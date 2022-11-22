import React, { useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'

const CustomImage = React.forwardRef((props, ref) => (
  <Image
    ref={ref}
    id="img"
    src="www.fillmurray.com/300/300"
    width={300}
    height={300}
    alt="Phill Murray"
    {...props}
  />
))

const MotionImage = motion(CustomImage)

export default function Page() {
  const [clicked, setClicked] = useState(false)
  return (
    <>
      <h1>Framer demo</h1>
      <MotionImage
        onClick={() => setClicked(true)}
        initial={{ opacity: 1 }}
        animate={{ opacity: clicked ? 0 : 1 }}
        transition={{ duration: 0.5 }}
      />
    </>
  )
}
