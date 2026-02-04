import { useState, useEffect, useLayoutEffect } from 'react'
import React from 'react'

const Component = ({ children, fallback }) => {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) {
    return fallback ?? /* @__PURE__ */ jsx(Fragment, {})
  }
  return children
}
export { Component }
