/* eslint-env jest */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { generateAgentFiles } from '../../packages/create-next-app/helpers/generate-agent-files'

const START_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'
const END_MARKER = '<!-- END:nextjs-agent-rules -->'

describe('create-next-app generateAgentFiles', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cna-agent-files-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const read = (file: string) => fs.readFileSync(path.join(dir, file), 'utf-8')
  const write = (file: string, content: string) =>
    fs.writeFileSync(path.join(dir, file), content, 'utf-8')

  it('creates AGENTS.md and CLAUDE.md when neither exists', () => {
    generateAgentFiles(dir)

    const agentsMd = read('AGENTS.md')
    expect(agentsMd).toContain(START_MARKER)
    expect(agentsMd).toContain(END_MARKER)
    expect(read('CLAUDE.md')).toBe('@AGENTS.md\n')
  })

  it('preserves shipped AGENTS.md content and appends the managed block', () => {
    const shipped = `# Blog starter\n\nAll reads go through \`lib/posts.ts\`.\n`
    write('AGENTS.md', shipped)

    generateAgentFiles(dir)

    const agentsMd = read('AGENTS.md')
    expect(agentsMd.startsWith(shipped)).toBe(true)
    expect(agentsMd).toContain(START_MARKER)
    expect(agentsMd).toContain(END_MARKER)
    expect(read('CLAUDE.md')).toBe('@AGENTS.md\n')
  })

  it('replaces an existing managed block in place', () => {
    write(
      'AGENTS.md',
      `# Before\n\n${START_MARKER}\nstale content\n${END_MARKER}\n\n# After\n`
    )

    generateAgentFiles(dir)

    const agentsMd = read('AGENTS.md')
    expect(agentsMd).toContain('# Before')
    expect(agentsMd).toContain('# After')
    expect(agentsMd).not.toContain('stale content')
    expect(agentsMd.indexOf(START_MARKER)).toBe(
      agentsMd.lastIndexOf(START_MARKER)
    )
  })

  it('leaves a shipped CLAUDE.md untouched', () => {
    const shipped = `@AGENTS.md\n\nExtra Claude-specific notes.\n`
    write('CLAUDE.md', shipped)

    generateAgentFiles(dir)

    expect(read('CLAUDE.md')).toBe(shipped)
    expect(read('AGENTS.md')).toContain(START_MARKER)
  })

  it('preserves CRLF line endings in an existing AGENTS.md', () => {
    write('AGENTS.md', `# Starter\r\n\r\nCustom rules.\r\n`)

    generateAgentFiles(dir)

    const agentsMd = read('AGENTS.md')
    expect(agentsMd).toContain('# Starter\r\n')
    expect(agentsMd).toContain(`${START_MARKER}\r\n`)
    expect(agentsMd).not.toMatch(/[^\r]\n/)
  })

  it('is idempotent', () => {
    write('AGENTS.md', `# Starter\n\nCustom rules.\n`)

    generateAgentFiles(dir)
    const first = read('AGENTS.md')
    generateAgentFiles(dir)

    expect(read('AGENTS.md')).toBe(first)
  })
})
