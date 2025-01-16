'use client'
import { useParams } from 'next/navigation'
import type { ReactNode } from 'react'

export function Body({ children }: { children: ReactNode }) {
  const { slug } = useParams() as { slug?: string[] }

  if (!slug) return children
  return (
    <>
      <style>
        {`:root {
            --fd-primary: ${slug[0] === 'app' ? `221.21 83.19% 65.33%` : '271.48 81.33% 65.88%'};
        }`}
      </style>
      {children}
    </>
  )
}
