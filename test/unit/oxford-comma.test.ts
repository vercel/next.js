/* eslint-env jest */
import { getOxfordCommaList } from 'next/dist/lib/oxford-comma-list'

describe('oxford-comma-list', () => {
  test('empty array', () => {
    expect(getOxfordCommaList([])).toMatchInlineSnapshot(`""`)
  })

  test('single item array', () => {
    expect(getOxfordCommaList(['apples'])).toMatchInlineSnapshot(`"apples"`)
  })

  test('two item array', () => {
    expect(
      getOxfordCommaList(['apples', 'strawberries'])
    ).toMatchInlineSnapshot(`"apples and strawberries"`)
  })

  test('three item array', () => {
    expect(
      getOxfordCommaList(['apples', 'strawberries', 'blueberries'])
    ).toMatchInlineSnapshot(`"apples, strawberries, and blueberries"`)
  })

  test('four item array', () => {
    expect(getOxfordCommaList(['1', '2', '3', '4'])).toMatchInlineSnapshot(
      `"1, 2, 3, and 4"`
    )
  })

  test('five item array', () => {
    expect(getOxfordCommaList(['1', '2', '3', '4', '5'])).toMatchInlineSnapshot(
      `"1, 2, 3, 4, and 5"`
    )
  })
})
