'use client'

const isClient = typeof window !== 'undefined'

export default function Mismatch() {
  return (
    <div className="parent">
      <header className="1" />
      {isClient && 'second'}
      <footer className="3" />
    </div>
  )
}
