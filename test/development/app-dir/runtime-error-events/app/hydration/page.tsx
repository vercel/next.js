'use client'
export default function Page() {
  return (
    <p id="content">
      {typeof window === 'undefined' ? 'server text' : 'client text'}
    </p>
  )
}
