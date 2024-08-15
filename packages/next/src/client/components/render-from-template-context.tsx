'use client'

import React, { useContext, type JSX } from 'react'
import { TemplateContext } from '../../shared/lib/app-router-context.shared-runtime'

export default function RenderFromTemplateContext(): JSX.Element {
  const children = useContext(TemplateContext)
  return <>{children}</>
}
