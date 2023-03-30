'use client'

export default function Component() {
  return (
    <div id="client">
      {Buffer.from('Hello Client Component', 'utf-8').toString()}
    </div>
  )
}
