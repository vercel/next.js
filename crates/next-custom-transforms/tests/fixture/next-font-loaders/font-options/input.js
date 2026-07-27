import React from 'react'
import { Fira_Code } from '@next/font/google'

const firaCode = Fira_Code({
  variant: '400',
  fallback: ['system-ui', { key: false }, []],
  preload: true,
  key: { key2: {} },
})

console.log(firaCode)
