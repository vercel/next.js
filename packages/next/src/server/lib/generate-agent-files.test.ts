import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  AGENT_FEEDBACK_END_MARKER,
  AGENT_FEEDBACK_START_MARKER,
  AGENT_RULES_START_MARKER,
  removeAgentFeedbackFiles,
  writeAgentFeedbackFiles,
  writeAgentFiles,
} from './generate-agent-files'

const block = `${AGENT_FEEDBACK_START_MARKER}\nstale\n${AGENT_FEEDBACK_END_MARKER}`

describe('removeAgentFeedbackFiles', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-files-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function write(name: string, content: string): string {
    const filePath = path.join(dir, name)
    fs.writeFileSync(filePath, content)
    return filePath
  }

  it('removes a block at the start of the file without a leading blank line', () => {
    const filePath = write('AGENTS.md', `${block}\n\n# Team rules\n`)

    expect(removeAgentFeedbackFiles(dir).agentsMd).toBe('removed')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('# Team rules\n')
  })

  it('removes a block in the middle and keeps one blank line between neighbors', () => {
    const filePath = write('AGENTS.md', `# Team rules\n\n${block}\n\n# More\n`)

    removeAgentFeedbackFiles(dir)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('# Team rules\n\n# More\n')
  })

  it('removes a block at the end without a trailing newline', () => {
    const filePath = write('AGENTS.md', `# Team rules\n\n${block}`)

    removeAgentFeedbackFiles(dir)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('# Team rules\n')
  })

  it('preserves CRLF line endings around the removed block', () => {
    const crlfBlock = block.split('\n').join('\r\n')
    const filePath = write(
      'AGENTS.md',
      `# Team rules\r\n\r\n${crlfBlock}\r\n\r\nKeep this.\r\n`
    )

    removeAgentFeedbackFiles(dir)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(
      '# Team rules\r\n\r\nKeep this.\r\n'
    )
  })

  it('deletes a file that held nothing but the managed block', () => {
    const filePath = write('AGENTS.md', `${block}\n`)

    expect(removeAgentFeedbackFiles(dir).agentsMd).toBe('removed')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('leaves a file alone when the end marker is missing', () => {
    const content = `# Team rules\n\n${AGENT_FEEDBACK_START_MARKER}\nbroken\n`
    const filePath = write('AGENTS.md', content)

    expect(removeAgentFeedbackFiles(dir).agentsMd).toBe('unchanged')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content)
  })

  it('reports skipped for files that do not exist', () => {
    expect(removeAgentFeedbackFiles(dir)).toEqual({
      agentsMd: 'skipped',
    })
  })

  it('round-trips with writeAgentFeedbackFiles on an existing AGENTS.md', () => {
    const filePath = write('AGENTS.md', '# Team rules\n')

    expect(writeAgentFeedbackFiles(dir).agentsMd).toBe('updated')
    expect(fs.readFileSync(filePath, 'utf-8')).toContain(
      AGENT_FEEDBACK_START_MARKER
    )
    expect(removeAgentFeedbackFiles(dir).agentsMd).toBe('removed')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('# Team rules\n')
  })
})

describe.each([
  ['agent rules', writeAgentFiles, AGENT_RULES_START_MARKER],
  ['agent feedback', writeAgentFeedbackFiles, AGENT_FEEDBACK_START_MARKER],
] as const)('%s file generation', (_name, writeFiles, marker) => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-files-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('creates only AGENTS.md and remains idempotent', () => {
    expect(writeFiles(dir)).toEqual({
      agentsMd: 'created',
    })
    const content = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8')
    expect(content).toContain(marker)

    expect(writeFiles(dir)).toEqual({
      agentsMd: 'unchanged',
    })
    expect(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8')).toBe(content)
  })
})
