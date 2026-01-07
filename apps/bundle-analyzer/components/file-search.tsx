'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'

interface FileSearchProps {
  value: string
  onChange: (value: string) => void
}

export function FileSearch({ value, onChange }: FileSearchProps) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault()
        inputRef.current?.focus()
      } else if (
        e.key === 'Escape' &&
        document.activeElement === inputRef.current
      ) {
        e.preventDefault()
        onChange('')
        inputRef.current?.blur()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onChange])

  const handleFocus = () => {
    setFocused(true)
  }

  const handleBlur = () => {
    setFocused(false)
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Search files..."
        className="w-48 focus:w-80 transition-all duration-200 pr-8"
      />
      {!value && !focused && (
        <Kbd className="absolute right-2 top-1/2 -translate-y-1/2">/</Kbd>
      )}
    </div>
  )
}
