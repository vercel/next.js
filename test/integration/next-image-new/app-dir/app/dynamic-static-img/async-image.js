'use client'

import dynamic from 'next/dynamic'

export const DynamicStaticImg = dynamic(
  () => import('../../components/static-img'),
  {
    ssr: false,
  }
)
