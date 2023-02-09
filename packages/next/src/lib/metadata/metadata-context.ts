import React from 'react'

const MetadataContext = (React as any).createServerContext(null)

if (process.env.NODE_ENV !== 'production') {
  MetadataContext.displayName = 'MetadataContext'
}

export function useMetadataBase() {
  return React.useContext(MetadataContext)
}

export default MetadataContext
