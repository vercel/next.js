import {
  lengthEncodeTuple,
  lengthDecodeTuple,
  lengthEncodeTupleWithTag,
  lengthDecodeTupleWithTag,
  type TaggedStringTuple,
} from './length-encoding'

const cases: { description: string; input: string[] }[] = [
  [],
  // empty strings
  [''],
  ['', ''],
  ['foo', ''],
  // parts that look like last-element delimiters
  [':'],
  ['', ':'],
  [':', ':'],
  ['foo', ':'],
  // mostly benign inputs
  ['foo'],
  ['foo', 'bar'],
  ['foo', 'baar', 'zaaaap'],
  ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff'],
  // parts that look length-prefixed
  ['0:foo', '1:baar', '3:zaaaap'],
  [lengthEncodeTuple(['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff'])],
  ['0:', '1:', '22:', '333:', '4444:', '55555:'],
  ['0:', '1:', ':22', ':333', '4444:', ':55555:'],
  ['0', '1', '22', '333', '4444', ':55555'],
].map((input) => ({ description: JSON.stringify(input), input }))

it.each(cases)(
  'can encode and decode tuples without changes - $description',
  ({ input }) => {
    const encoded: string = lengthEncodeTuple(input)
    const decoded: string[] = lengthDecodeTuple(encoded)
    expect(decoded).toEqual(input)
  }
)

enum MyTag {
  A = 0,
  B = 1,
  C = 9,
}

describe('tags', () => {
  describe.each([MyTag.A, MyTag.B, MyTag.C])('tag value - %d', (tag) => {
    it.each(cases)(
      'can encode and decode tuples with a tag without changes - $description',
      ({ input: inputWithoutTag }) => {
        const input: TaggedStringTuple = [tag, ...inputWithoutTag]
        const encoded: string = lengthEncodeTupleWithTag(input)
        const decoded: TaggedStringTuple = lengthDecodeTupleWithTag(encoded)
        expect(decoded).toEqual(input)
      }
    )
  })
})
