'use cache'
import React from 'react'
import { Inter } from '@next/font/google'

const inter = Inter()

export async function Cached({ children }) {
  return <div className={inter.className}>{children}</div>
}
