'use client'

import React, { useState } from 'react'
import Link from 'next/link'

export default function Start() {
  const [href, setHref] = useState('')
  return (
    <form>
      <input
        type="text"
        name="href"
        onChange={(e) => setHref(e.target.value)}
        value={href}
      />
      {href === '' ? null : <Link href={href}>Navigate</Link>}
    </form>
  )
}
