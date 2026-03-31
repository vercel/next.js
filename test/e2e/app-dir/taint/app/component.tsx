'use client'

export default function ClientComponent({
  config,
}: {
  config: { [key: string]: string }
}) {
  return <h1>{config.something}</h1>
}
