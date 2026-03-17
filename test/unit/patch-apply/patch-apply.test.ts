import { parsePatch, applyPatches } from 'next/src/server/dev/patch-apply'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('parsePatch', () => {
  it('parses a write operation', () => {
    const patch = `--- write: app/page.tsx
export default function Home() {
  return <h1>Hello</h1>
}
---`
    const ops = parsePatch(patch)
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('write')
    expect(ops[0].filePath).toBe('app/page.tsx')
    expect(ops[0].content).toContain('Hello')
  })

  it('parses an edit operation', () => {
    const patch = `--- edit: app/page.tsx
--- search
  <h1>Hello World</h1>
--- replace
  <h1>Hello Agentic World</h1>
---`
    const ops = parsePatch(patch)
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('edit')
    expect(ops[0].filePath).toBe('app/page.tsx')
    expect(ops[0].search).toContain('Hello World')
    expect(ops[0].replace).toContain('Hello Agentic World')
  })

  it('parses multiple operations in one patch', () => {
    const patch = `--- write: app/layout.tsx
export default function Layout({ children }) {
  return <html><body>{children}</body></html>
}
---
--- edit: app/page.tsx
--- search
  <h1>Old</h1>
--- replace
  <h1>New</h1>
---`
    const ops = parsePatch(patch)
    expect(ops).toHaveLength(2)
    expect(ops[0].type).toBe('write')
    expect(ops[1].type).toBe('edit')
  })

  it('returns empty array for empty input', () => {
    expect(parsePatch('')).toHaveLength(0)
    expect(parsePatch('  \n\n  ')).toHaveLength(0)
  })
})

describe('applyPatches', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes a new file', () => {
    const ops = parsePatch(`--- write: hello.txt
Hello World
---`)
    const result = applyPatches(ops, tmpDir)
    expect(result.success).toBe(true)
    expect(result.affectedFiles).toEqual(['hello.txt'])
    expect(fs.readFileSync(path.join(tmpDir, 'hello.txt'), 'utf-8')).toBe(
      'Hello World'
    )
  })

  it('creates nested directories for write', () => {
    const ops = parsePatch(`--- write: a/b/c.txt
nested
---`)
    const result = applyPatches(ops, tmpDir)
    expect(result.success).toBe(true)
    expect(fs.readFileSync(path.join(tmpDir, 'a', 'b', 'c.txt'), 'utf-8')).toBe(
      'nested'
    )
  })

  it('applies a search/replace edit', () => {
    const filePath = path.join(tmpDir, 'page.tsx')
    fs.writeFileSync(filePath, '<h1>Hello World</h1>\n<p>Content</p>\n')

    const ops = parsePatch(`--- edit: page.tsx
--- search
<h1>Hello World</h1>
--- replace
<h1>Hello Agentic World</h1>
---`)
    const result = applyPatches(ops, tmpDir)
    expect(result.success).toBe(true)
    const content = fs.readFileSync(filePath, 'utf-8')
    expect(content).toContain('Hello Agentic World')
    expect(content).toContain('<p>Content</p>')
  })

  it('fails when search text is not found', () => {
    const filePath = path.join(tmpDir, 'page.tsx')
    fs.writeFileSync(filePath, '<h1>Hello World</h1>\n')

    const ops = parsePatch(`--- edit: page.tsx
--- search
<h1>Does Not Exist</h1>
--- replace
<h1>Replaced</h1>
---`)
    const result = applyPatches(ops, tmpDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
    // File should not be modified (atomic)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('<h1>Hello World</h1>\n')
  })

  it('fails when edit target file does not exist', () => {
    const ops = parsePatch(`--- edit: nonexistent.tsx
--- search
foo
--- replace
bar
---`)
    const result = applyPatches(ops, tmpDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('applies multiple operations atomically', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'old-a')
    fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'old-b')

    const ops = parsePatch(`--- edit: a.txt
--- search
old-a
--- replace
new-a
---
--- edit: b.txt
--- search
old-b
--- replace
new-b
---`)
    const result = applyPatches(ops, tmpDir)
    expect(result.success).toBe(true)
    expect(fs.readFileSync(path.join(tmpDir, 'a.txt'), 'utf-8')).toBe('new-a')
    expect(fs.readFileSync(path.join(tmpDir, 'b.txt'), 'utf-8')).toBe('new-b')
  })
})
