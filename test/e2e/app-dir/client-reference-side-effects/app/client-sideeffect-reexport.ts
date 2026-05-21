'use client'

// @ts-expect-error
if (typeof window !== 'undefined') window.client_sideeffect_reexport = true

export { Component } from './client'
