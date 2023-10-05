'use client'
import { useRouter } from 'next/navigation'
import React from 'react'

export default function Button() {
  const router = useRouter()
  return <button>My Button</button>
}
