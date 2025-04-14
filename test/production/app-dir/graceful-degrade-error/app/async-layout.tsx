'use client'

import dynamic from 'next/dynamic'

const AsyncLayout = dynamic(async () => import('./layout-wrapper'))

export default AsyncLayout
