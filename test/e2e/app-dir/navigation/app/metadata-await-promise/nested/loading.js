'use client'
import { useEffect } from 'react'

export default function Loading() {
  useEffect(() => {
    window.shownLoading = true
  }, [])
  return <div id="loading">Loading</div>
}
