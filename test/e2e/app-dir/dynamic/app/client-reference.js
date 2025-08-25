'use client'

import dynamic from 'next/dynamic'

export const DynamicComponent = dynamic(() => import('./dynamic-component'))
