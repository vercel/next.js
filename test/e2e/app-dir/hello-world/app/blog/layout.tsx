'use client'
import { MyPage } from './_components/page'
import { MyLayout } from './_components/layout'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {children}
      <MyLayout />
      <MyPage />
    </div>
  )
}

export const dynamic = 'force-dynamic'
