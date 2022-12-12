'use client'

import dynamic from 'next/dynamic'

const ClientHead = dynamic(() => import('./client-head'), { ssr: false })

export default ClientHead
