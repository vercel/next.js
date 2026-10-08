'use client'

import dynamic from 'next/dynamic'

const Widget = dynamic(() => import('./widget'))

export default function Resolver() {
  return <Widget />
}
