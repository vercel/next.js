'use client'

import { useContext, createContext } from 'react'

import React from 'react'

type CaptureFn = (moduleName: string) => void

export const LoadableContext = React.createContext<CaptureFn | null>(null)

if (process.env.NODE_ENV !== 'production') {
  LoadableContext.displayName = 'LoadableContext'
}

function init() {
  // Server only
  // if (typeof window === 'undefined') {
  //   ALL_INITIALIZERS.push(init)
  // }
  // // Client only
  // if (!initialized && typeof window !== 'undefined') {
  //   // require.resolveWeak check is needed for environments that don't have it available like Jest
  //   const moduleIds =
  //     opts.webpack && typeof (require as any).resolveWeak === 'function'
  //       ? opts.webpack()
  //       : opts.modules
  //   if (moduleIds) {
  //     READY_INITIALIZERS.push((ids: any) => {
  //       for (const moduleId of moduleIds) {
  //         if (ids.includes(moduleId)) {
  //           return init()
  //         }
  //       }
  //     })
  //   }
  // }
}

export function PreloadModule({ opts }: { opts: any }) {
  const moduleId =
    opts.webpack && typeof (require as any).resolveWeak === 'function'
      ? opts.webpack()
      : opts.modules

  console.log('PreloadModule:moduleIds', 'opts', opts)
  // const cssModuleIds = (moduleIds || []).filter((moduleId: any) => moduleId.endsWith('.css'))

  const contextCallback = useContext(LoadableContext)
  if (contextCallback) {
    contextCallback(moduleId)
  }
  // if (context && Array.isArray(cssModuleIds)) {
  //   cssModuleIds.forEach((moduleId) => {
  //   })
  // }

  return null
}
