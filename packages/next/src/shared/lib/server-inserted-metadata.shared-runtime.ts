'use client'

import type React from 'react'
import { createContext } from 'react'

export type PendingMetadataNodes = Promise<React.ReactNode>
type PendingMetadataSetter = (m: PendingMetadataNodes) => void

export const ServerInsertedMetadataContext =
  createContext<PendingMetadataSetter | null>(null)
