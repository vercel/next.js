'use client'

import { useEffect, useState } from 'react'
import DebugBadge from './DebugBadge'
import { recipes } from '../recipes-index'

export default function RecipeBrowser() {
  const [openRecipe, setOpenRecipe] = useState<string | null>(null)
  const [body, setBody] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const paths = Object.keys(recipes).sort()

  return (
    <div>
      {paths.length === 0 ? (
        <p id="empty-state">No recipes yet.</p>
      ) : (
        <ul id="recipe-list">
          {paths.map((path) => (
            <li key={path}>
              <button
                onClick={async () => {
                  setOpenRecipe(path)
                  setBody(await recipes[path]())
                }}
              >
                {path}
              </button>
            </li>
          ))}
        </ul>
      )}
      {body !== null && (
        <article id="recipe-body" data-recipe={openRecipe ?? undefined}>
          <pre>{body}</pre>
        </article>
      )}
      <div id="browser-badge">{mounted ? <DebugBadge /> : null}</div>
    </div>
  )
}
