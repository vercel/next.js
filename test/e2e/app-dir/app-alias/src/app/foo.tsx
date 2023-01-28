'use client'

export default function Foo({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick}>click me</button>
}
