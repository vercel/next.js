/* eslint-env jest */
import { getSpecifiedPages } from 'next/dist/build'

describe('getSpecifiedPages', () => {
  it('should only choose selected', async () => {
    expect(await getSpecifiedPages(__dirname, ['a'], ['js'])).toMatchSnapshot()

    let err
    try {
      await getSpecifiedPages(__dirname, ['a', 'b'], ['js'])
    } catch (e) {
      err = e
    }
    expect(err).toBeTruthy()

    expect(
      await getSpecifiedPages(__dirname, ['a', 'b'], ['js', 'jsx'])
    ).toMatchSnapshot()

    expect(
      await getSpecifiedPages(__dirname, ['a', 'b'], ['js', 'jsx', 'mdx'])
    ).toMatchSnapshot()

    expect(
      await getSpecifiedPages(__dirname, ['a', 'b', 'c'], ['js', 'jsx', 'mdx'])
    ).toMatchSnapshot()

    expect(
      await getSpecifiedPages(__dirname, ['a', 'b', 'c'], ['js', 'jsx', 'mdx'])
    ).toEqual(
      await getSpecifiedPages(__dirname, ['a,b,c'], ['js', 'jsx', 'mdx'])
    )
    expect(
      await getSpecifiedPages(__dirname, ['a', 'b', 'c'], ['js', 'jsx', 'mdx'])
    ).toEqual(
      await getSpecifiedPages(__dirname, ['a,c', 'b'], ['js', 'jsx', 'mdx'])
    )
    expect(
      await getSpecifiedPages(__dirname, ['a', 'b', 'c'], ['js', 'jsx', 'mdx'])
    ).toEqual(
      await getSpecifiedPages(__dirname, ['a', 'c,b'], ['js', 'jsx', 'mdx'])
    )
  })

  it('should select all', async () => {
    expect(await getSpecifiedPages(__dirname, ['**'], ['js'])).toMatchSnapshot()
    expect(
      await getSpecifiedPages(__dirname, ['**'], ['js', 'mdx', 'jsx'])
    ).toMatchSnapshot()
  })

  it('should filter pages', async () => {
    expect(
      await getSpecifiedPages(__dirname, ['**', '-a'], ['js'])
    ).toMatchSnapshot()
    expect(
      await getSpecifiedPages(__dirname, ['**', '-a'], ['js', 'mdx', 'jsx'])
    ).toMatchSnapshot()
    expect(
      await getSpecifiedPages(__dirname, ['**,-a', '-c'], ['js', 'mdx', 'jsx'])
    ).toMatchSnapshot()
  })
})
