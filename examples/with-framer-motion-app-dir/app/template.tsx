'use client'

import { motion } from 'framer-motion'
import React from 'react'
import { PropsWithChildren } from 'react'

export default function Template({ children }: PropsWithChildren) {
  return (
    <motion.div
      initial={{ opacity: 0, dur: 1000 }}
      animate={{ opacity: 1, dur: 1000 }}
      exit={{ opacity: 0, dur: 1000 }}
      aria-label="Template"
    >
      <hr />
      {children}
    </motion.div>
  )
}
