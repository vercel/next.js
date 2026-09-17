'use client'
import React, { useState } from 'react'

export function Footer() {
  const [text, setText] = useState('Footer Initial')
  return (
    <footer id="client-footer" onClick={() => setText('Footer Clicked')}>
      {text}
    </footer>
  )
}
