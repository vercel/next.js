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

  it('returns empty array for garbage input with no directives', () => {
    expect(
      parsePatch('just some random text\nno directives here')
    ).toHaveLength(0)
  })

  it('parses multi-line search/replace blocks', () => {
    const patch = `--- edit: app/page.tsx
--- search
function foo() {
  return 1
}
--- replace
function foo() {
  return 2
}
---`
    const ops = parsePatch(patch)
    expect(ops).toHaveLength(1)
    expect(ops[0].search).toContain('function foo() {\n  return 1\n}')
    expect(ops[0].replace).toContain('function foo() {\n  return 2\n}')
  })

  it('parses multiple edits to the same file', () => {
    const patch = `--- edit: app/page.tsx
--- search
foo
--- replace
bar
---
--- edit: app/page.tsx
--- search
baz
--- replace
qux
---`
    const ops = parsePatch(patch)
    expect(ops).toHaveLength(2)
    expect(ops[0].filePath).toBe('app/page.tsx')
    expect(ops[1].filePath).toBe('app/page.tsx')
    expect(ops[0].search).toContain('foo')
    expect(ops[1].search).toContain('baz')
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

  it('write overwrites an existing file', () => {
    const filePath = path.join(tmpDir, 'existing.txt')
    fs.writeFileSync(filePath, 'old content')

    const ops = parsePatch(`--- write: existing.txt
new content
---`)
    const result = applyPatches(ops, tmpDir)
    expect(result.success).toBe(true)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content')
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

  it('tolerates trailing whitespace differences in search', () => {
    const filePath = path.join(tmpDir, 'page.tsx')
    // File has trailing spaces on the line
    fs.writeFileSync(filePath, '<h1>Hello</h1>   \n<p>World</p>\n')

    // Search text has no trailing spaces
    const ops = parsePatch(`--- edit: page.tsx
--- search
<h1>Hello</h1>
--- replace
<h1>Changed</h1>
---`)
    const result = applyPatches(ops, tmpDir)
    expect(result.success).toBe(true)
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('<h1>Changed</h1>')
  })

  it('applies multi-line search/replace', () => {
    const filePath = path.join(tmpDir, 'page.tsx')
    fs.writeFileSync(
      filePath,
      'function foo() {\n  return 1\n}\n\nfunction bar() {}\n'
    )

    const ops = parsePatch(`--- edit: page.tsx
--- search
function foo() {
  return 1
}
--- replace
function foo() {
  return 42
}
---`)
    const result = applyPatches(ops, tmpDir)
    expect(result.success).toBe(true)
    const content = fs.readFileSync(filePath, 'utf-8')
    expect(content).toContain('return 42')
    expect(content).toContain('function bar() {}')
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

  it('does not write first file when second operation fails (atomicity)', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'original-a')
    fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'original-b')

    const ops = parsePatch(`--- edit: a.txt
--- search
original-a
--- replace
modified-a
---
--- edit: b.txt
--- search
text-that-does-not-exist
--- replace
modified-b
---`)
    const result = applyPatches(ops, tmpDir)
    expect(result.success).toBe(false)
    // a.txt should NOT have been modified because b.txt failed
    expect(fs.readFileSync(path.join(tmpDir, 'a.txt'), 'utf-8')).toBe(
      'original-a'
    )
    expect(fs.readFileSync(path.join(tmpDir, 'b.txt'), 'utf-8')).toBe(
      'original-b'
    )
  })

  it('returns correct diffs summary', () => {
    fs.writeFileSync(path.join(tmpDir, 'page.tsx'), 'line1\nline2\nline3\n')

    const ops = parsePatch(`--- edit: page.tsx
--- search
line2
--- replace
replaced-line2a
replaced-line2b
---`)
    const result = applyPatches(ops, tmpDir)
    expect(result.success).toBe(true)
    expect(result.diffs).toHaveLength(1)
    expect(result.diffs[0].file).toBe('page.tsx')
    expect(result.diffs[0].type).toBe('edit')
    expect(result.diffs[0].summary).toBe('-1 lines, +2 lines')
  })
})
