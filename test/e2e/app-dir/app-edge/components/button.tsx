'use client'
import { useRouter } from 'next/navigation'
import React from 'react'

export default function Button() {
  const router = useRouter()
  const onClick = () => router.push('/')
  return <button onClick={onClick}>My Button</button>
}
