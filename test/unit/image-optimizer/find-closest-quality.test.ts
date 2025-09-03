/* eslint-env jest */
import { findClosestQuality } from 'next/dist/shared/lib/find-closest-quality'

describe('findClosestQuality', () => {
  it.each<{ input: Parameters<typeof findClosestQuality>; output: number }>([
    {
      input: [undefined, undefined],
      output: 75,
    },
    {
      input: [50, undefined],
      output: 50,
    },
    {
      input: [50, { qualities: undefined }],
      output: 50,
    },
    {
      input: [35, { qualities: [10, 30, 50] }],
      output: 30,
    },
    {
      input: [30, { qualities: [10, 30, 50] }],
      output: 30,
    },
    {
      input: [31, { qualities: [10, 30, 50] }],
      output: 30,
    },
    {
      input: [29, { qualities: [10, 30, 50] }],
      output: 30,
    },
    {
      input: [39, { qualities: [10, 30, 50] }],
      output: 30,
    },
    {
      input: [40, { qualities: [10, 30, 50] }],
      output: 30, // favor the lower number when halfway
    },
    {
      input: [41, { qualities: [10, 30, 50] }],
      output: 50,
    },
    {
      input: [75, { qualities: [50, 75, 100] }],
      output: 75,
    },
    {
      input: [undefined, { qualities: [50, 75, 100] }],
      output: 75,
    },
    {
      input: [undefined, { qualities: [25, 60, 100] }],
      output: 60, // use closest to 75 when 75 is not in the config
    },
    {
      input: [undefined, { qualities: [25, 50, 75] }],
      output: 75, // use 75 when 75 is in the config
    },
    {
      input: [undefined, { qualities: [100, 10, 75, 15] }],
      output: 75, // use 75 when 75 is in the config, even out of order
    },
    {
      input: [10, { qualities: [100, 10, 75, 15] }],
      output: 10, // use input even when config is out of order
    },
    {
      input: [14, { qualities: [100, 10, 75, 15] }],
      output: 15, // use closet input even when config is out of order
    },
  ])('for quality $input expected $output', ({ input, output }) => {
    expect(findClosestQuality(...input)).toEqual(output)
  })
})
