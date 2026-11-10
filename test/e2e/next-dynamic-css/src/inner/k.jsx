import dynamic from 'next/dynamic'

export const Comp = dynamic(() => import('../Content'), { ssr: false })
