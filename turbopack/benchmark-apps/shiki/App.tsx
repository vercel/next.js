import * as React from 'react'
import { codeToHtml } from 'shiki'

const code = 'const a = 1' // input code

export default async function Home() {
  const html = await codeToHtml(code, {
    lang: 'javascript',
    theme: 'vitesse-dark',
  })

  return <pre>{html}</pre>
}
