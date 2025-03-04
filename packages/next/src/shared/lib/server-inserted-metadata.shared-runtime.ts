'use client'

import type React from 'react'
import { createContext } from 'react'

export type MetadataResolver = () => React.ReactNode
type MetadataResolverSetter = (m: MetadataResolver) => void

export const ServerInsertedMetadataContext =
  createContext<MetadataResolverSetter | null>(null)
