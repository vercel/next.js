import { selectHarness } from './harness'

describe('upgrade harness', () => {
  it.each(['codex', 'claude', 'claude-code'])(
    'returns work to active %s',
    (active) => {
      expect(selectHarness(active).kind).toBe('handoff')
    }
  )
  it.each([null, 'unsupported-agent'])(
    'offers instructions instead of launching a process for %s',
    (active) => {
      expect(selectHarness(active).kind).toBe('fallback')
    }
  )
})
