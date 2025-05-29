/* eslint-disable react/jsx-pascal-case */
import * as React from 'react'
import * as FramerMotion from 'framer-motion'

console.log(FramerMotion)

export default function Home() {
  return (
    <div>
      <FramerMotion.motion.div animate={{ x: 0 }} />
    </div>
  )
}
