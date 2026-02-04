'use server'
import React from 'react'
import { Inter } from '@next/font/google'

const inter = Inter()

export async function myCoolServerAction() {
  return <div className={inter.className}>Hello from server action</div>
}
