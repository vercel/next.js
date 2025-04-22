'use client'

import dynamic from 'next/dynamic'

export const Large = dynamic(() => import('./content'))
