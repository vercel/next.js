import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const useClickAway = (ref, onClickAway) => {
  useEffect(() => {
    const handler = (event) => {
      const el = ref.current

      // when menu is open and clicked inside menu, A is expected to be false
      // when menu is open and clicked outside menu, A is expected to be true
      console.log('A', el && !el.contains(event.target))

      el && !el.contains(event.target) && onClickAway(event)
    }

    document.addEventListener('click', handler)

    return () => {
      document.removeEventListener('click', handler)
    }
  }, [onClickAway, ref])
}

export default function App() {
  const [open, setOpen] = useState(false)

  const menuRef = useRef(null)

  const onClickAway = useCallback(() => {
    console.log('click away, open', open)
    if (open) {
      setOpen(false)
    }
  }, [open])

  useClickAway(menuRef, onClickAway)

  return (
    <div>
      <div id="click-me" onClick={() => setOpen(true)}>
        Open Menu
      </div>
      {open && (
        <div ref={menuRef} id="the-menu">
          <Link href="/">some link</Link>
        </div>
      )}
    </div>
  )
}
