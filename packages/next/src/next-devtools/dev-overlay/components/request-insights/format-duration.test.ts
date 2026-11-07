import { formatDuration } from './format-duration'

describe('request insights duration formatting', () => {
  it.each([
    [undefined, '-'],
    [0, '0 ms'],
    [0.01, '<0.1 ms'],
    [0.2, '0.2 ms'],
    [1.4, '1.4 ms'],
    [2, '2 ms'],
    [999.6, '1000 ms'],
    [1000, '1.00 s'],
  ])('formats %s milliseconds as %s', (duration, expected) => {
    expect(formatDuration(duration)).toBe(expected)
  })
})
