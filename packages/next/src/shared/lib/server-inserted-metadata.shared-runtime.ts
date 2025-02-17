'use client'

import { type JSX, createContext } from 'react'

export type MetadataResolver = () => JSX.Element
type MetadataResolverSetter = (m: MetadataResolver) => void

export const ServerInsertedMetadataContext =
  createContext<MetadataResolverSetter | null>(null)
