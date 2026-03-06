/**
 * Prefer Server Actions
 *
 * Tests whether the agent uses a server action with the form `action` attribute
 * instead of client-side onSubmit handlers and fetch calls.
 *
 * Tricky because agents tend to reach for 'use client' + onSubmit + fetch
 * instead of the simpler server action pattern with 'use server'.
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

function readAppFiles(): string {
  const appDir = join(process.cwd(), 'app')
  if (!existsSync(appDir)) return ''
  const entries = readdirSync(appDir, { recursive: true }) as string[]
  const files = entries.filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  return files.map((f) => readFileSync(join(appDir, f), 'utf-8')).join('\n')
}

/**
 * Read ContactForm.tsx and any local files it imports from the app directory.
 * Models sometimes extract form UI into a separate component file, so we need
 * to check all related files for patterns like <form>, validation, etc.
 */
function readContactFormAndImports(): string {
  const appDir = join(process.cwd(), 'app')
  const contactFormPath = join(appDir, 'ContactForm.tsx')
  if (!existsSync(contactFormPath)) return ''

  const contactFormContent = readFileSync(contactFormPath, 'utf-8')
  const parts = [contactFormContent]

  // Find local imports (e.g., import Foo from './Foo' or import { Foo } from './bar')
  const importPattern = /from\s+['"]\.\/([^'"]+)['"]/g
  let match
  while ((match = importPattern.exec(contactFormContent)) !== null) {
    const importPath = match[1]
    // Try .tsx and .ts extensions
    for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
      const fullPath = join(appDir, importPath + ext)
      if (existsSync(fullPath)) {
        parts.push(readFileSync(fullPath, 'utf-8'))
        break
      }
    }
    // Also try if the import already has an extension
    const directPath = join(appDir, importPath)
    if (existsSync(directPath)) {
      parts.push(readFileSync(directPath, 'utf-8'))
    }
  }

  return parts.join('\n')
}

test('renders contact form with Contact Us heading', () => {
  const content = readAppFiles()
  expect(content).toMatch(/Contact\s+Us/)
})

test('uses server action instead of client-side submission', () => {
  const allRelated = readContactFormAndImports()

  // The ContactForm or its imports should not rely on client-side submission patterns
  expect(allRelated).not.toMatch(/onSubmit|fetch\s*\(|useState|preventDefault/)
  // Must have 'use server' directive somewhere in the ContactForm or its imports
  expect(allRelated).toMatch(/['"]use server['"];?/)
  // Must have an async server action function that accepts FormData
  expect(allRelated).toMatch(/async\s+function\s+\w+.*FormData/)
})

test('processes form data using FormData API', () => {
  const content = readContactFormAndImports()

  expect(content).toMatch(/formData\.get\s*\(\s*['"]name['"]\s*\)/)
  expect(content).toMatch(/formData\.get\s*\(\s*['"]email['"]\s*\)/)
  expect(content).toMatch(/formData\.get\s*\(\s*['"]message['"]\s*\)/)
})

test('has proper form structure with action attribute', () => {
  const content = readContactFormAndImports()

  expect(content).toMatch(/<form[^>]*action\s*=\s*\{[^}]+\}/)
  expect(content).toMatch(/name\s*=\s*['"]name['"]/)
  expect(content).toMatch(/name\s*=\s*['"]email['"]/)
  expect(content).toMatch(/name\s*=\s*['"]message['"]/)
  expect(content).toMatch(/type\s*=\s*['"]submit['"]/)
})

test('includes form validation', () => {
  const content = readContactFormAndImports()

  expect(content).toMatch(/throw|error|invalid|required/i)
})

test('does not use API routes pattern', () => {
  const content = readContactFormAndImports()

  expect(content).not.toMatch(/\/api\/\w+|JSON\.stringify|response\.json\(\)/)
})
