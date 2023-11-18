'use client'
import React from 'react'
import { AnimatePresence } from 'framer-motion'
import { PropsWithChildren } from 'react'

export default function Glue({ children }: PropsWithChildren) {
  return (
    <AnimatePresence initial={false} mode="wait">
      {children}
    </AnimatePresence>
  )
}
