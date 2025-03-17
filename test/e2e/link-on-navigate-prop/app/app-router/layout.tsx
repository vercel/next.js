'use client'

import React from 'react'
import OnNavigate from '../../shared/OnNavigate'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <OnNavigate rootPath="/app-router">{children}</OnNavigate>
}
