import { lazy } from 'react'

// @ts-ignore
export const element = lazy(() => Promise.resolve({ default: <a>Linkk</a> }))
