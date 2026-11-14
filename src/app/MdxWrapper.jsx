'use client'

import React, { useState, useEffect } from 'react'

export default function MdxWrapper({ filePath }) {
  const [Component, setComponent] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadMdx() {
      try {
        const module = await import(`${filePath}`)
        setComponent(() => module.default)
      } catch (err) {
        console.error(`Error loading MDX file: ${filePath}`, err)
        setError(err)
      }
    }

    loadMdx()
  }, [filePath])

  if (error) return <div>Error loading MDX content</div>
  if (!Component) return <div>Loading...</div>

  return <Component />
}
