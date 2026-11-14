'use client'

import dynamic from 'next/dynamic'
import { BulkyA } from '../components/bulky-a'
import { BulkyB } from '../components/bulky-b'
import { LinkAccordion } from '../components/link-accordion'

const LazyCounter = dynamic(() => import('./lazy-counter'), { ssr: false })

export default function Home() {
  return (
    <main>
      <h1 id="home">max chunk size home</h1>
      <BulkyA />
      <BulkyB />
      <LazyCounter />
      <LinkAccordion href="/other" prefetch={false}>
        other
      </LinkAccordion>
    </main>
  )
}
