'use client'

import { useEffect, useState } from 'react'

export default function Page() {
  const [className, setClassName] = useState('')
  useEffect(() => {
    import('../styles.injectstyle').then((styles) => setClassName(styles.box))
  }, [])
  return (
    <main id="box" data-class={className} className={className}>
      CSS Modules context
    </main>
  )
}
