/* eslint-env jest */
import { getSpecifiedPages as _getSpecifiedPages } from 'next/dist/build/utils'

const getSpecifiedPages = async (...args) =>
  (await _getSpecifiedPages(...args)).map(pg => pg.replace(/\\+/g, '/'))

describe('getSpecifiedPages', () => {
  it('should only choose selected', async () => {
    expect(await getSpecifiedPages(__dirname, 'a', ['js'])).toMatchSnapshot()

    let err
    try {
      await getSpecifiedPages(__dirname, 'a,b', ['js'])
    } catch (e) {
      err = e
    }
    expect(err).toBeTruthy()

    expect(
      await getSpecifiedPages(__dirname, 'a,b', ['js', 'jsx'])
    ).toMatchSnapshot()

    expect(
      await getSpecifiedPages(__dirname, 'a,b', ['js', 'jsx', 'mdx'])
    ).toMatchSnapshot()

    expect(
      await getSpecifiedPages(__dirname, 'a,b,c', ['js', 'jsx', 'mdx'])
    ).toMatchSnapshot()
  })
})
