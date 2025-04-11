'use client'

import AsyncLayout from './async-layout'

export default function Root({ children }: { children: React.ReactNode }) {
  return <AsyncLayout>{children}</AsyncLayout>
}
