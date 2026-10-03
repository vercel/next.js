'use client'
import React, { useState } from 'react'

export function Header() {
  const [text, setText] = useState('Header Initial')
  return (
    <header id="client-header" onClick={() => setText('Header Clicked')}>
      {text}
    </header>
  )
}
