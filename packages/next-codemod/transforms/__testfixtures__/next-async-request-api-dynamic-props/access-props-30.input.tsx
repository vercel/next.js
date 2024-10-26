'use client'

import type { JSX } from 'react'

interface Props {
  params: { slug: string }
}

export default function Page({ params }: Props): JSX.Element {
  const { slug } = params

  return <p>{slug}</p>
}
