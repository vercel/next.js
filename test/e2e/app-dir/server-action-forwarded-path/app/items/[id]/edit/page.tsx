'use client'

import Link from 'next/link'
import { useContext, useEffect } from 'react'
import { RegisterDraft } from '../../../draft-provider'
import { saveDraft } from './save-draft'

export default function Editor() {
  const register = useContext(RegisterDraft)
  useEffect(() => {
    register?.(() => saveDraft('1', 'hello'))
  }, [register])

  return (
    <Link id="leave-editor" href="/items/1" prefetch={false}>
      Leave editor
    </Link>
  )
}
