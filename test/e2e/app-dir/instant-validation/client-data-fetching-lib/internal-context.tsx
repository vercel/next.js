'use client'

import { createContext } from 'react'
import type { CacheIdentifier } from './client'

export const CacheIdentifierContext = createContext<CacheIdentifier | null>(
  null
)
