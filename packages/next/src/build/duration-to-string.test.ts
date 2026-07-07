import {
  durationToString,
  hrtimeBigIntDurationToString,
  hrtimeDurationToString,
  hrtimeToSeconds,
} from './duration-to-string'

describe('durationToString', () => {
  it.each([
    [0, '0ms'],
    [0.5, '500ms'],
    [2, '2000ms'],
    [2.5, '2.5s'],
    [40, '40.0s'],
    [45.4, '45s'],
    [120, '120s'],
    [150, '2.5min'],
  ])('formats %s seconds as %s', (duration, expected) => {
    expect(durationToString(duration)).toBe(expected)
  })
})

describe('hrtimeBigIntDurationToString', () => {
  it.each([
    [BigInt(0), '0.0ms'],
    [BigInt(500_000), '0.5ms'],
    [BigInt(1_500_000), '1.5ms'],
    [BigInt(2_000_000), '2ms'],
    [BigInt(1_500_000_000), '1500ms'],
    [BigInt(2_000_000_000), '2.0s'],
    [BigInt(2_500_000_000), '2.5s'],
    [BigInt(40_000_000_000), '40s'],
    [BigInt(45_400_000_000), '45s'],
    [BigInt(120_000_000_000), '2.0min'],
    [BigInt(150_000_000_000), '2.5min'],
  ])('formats %s nanoseconds as %s', (duration, expected) => {
    expect(hrtimeBigIntDurationToString(duration)).toBe(expected)
  })
})

describe('hrtimeToSeconds', () => {
  it.each([
    [[0, 0], 0],
    [[1, 500_000_000], 1.5],
    [[2, 1], 2.000000001],
  ] as Array<[[number, number], number]>)(
    'converts %j to %s seconds',
    (hrtime, expected) => {
      expect(hrtimeToSeconds(hrtime)).toBe(expected)
    }
  )
})

describe('hrtimeDurationToString', () => {
  it.each([
    [[0, 500_000_000], '500ms'],
    [[2, 500_000_000], '2.5s'],
    [[45, 400_000_000], '45s'],
    [[150, 0], '2.5min'],
  ] as Array<[[number, number], string]>)(
    'formats %j as %s',
    (hrtime, expected) => {
      expect(hrtimeDurationToString(hrtime)).toBe(expected)
    }
  )
})
