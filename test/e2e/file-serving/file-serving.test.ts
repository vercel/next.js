/* eslint-disable jest/no-identical-title */
import fs from 'fs-extra'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('file-serving', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const expectStatus = async (path) => {
    const containRegex = /(This page could not be found|Bad Request)/
    // test base mount point `public/`
    const checkRes = async (res) => {
      if (res.status === 308) {
        const redirectDest = res.headers.get('location')
        const parsedUrl = new URL(redirectDest)
        expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      } else {
        try {
          expect(res.status === 400 || res.status === 404).toBe(true)
        } catch (err) {
          require('console').error({ path, status: res.status })
          throw err
        }
        expect(await res.text()).toMatch(containRegex)
      }
    }
    const res = await next.fetch(path, {
      redirect: 'manual',
    })
    await checkRes(res)

    // test `/_next` mount point
    const res2 = await next.fetch(`/_next/${path}`, {
      redirect: 'manual',
    })
    await checkRes(res2)

    // test `/static` mount point
    const res3 = await next.fetch(`/static/${path}`, {
      redirect: 'manual',
    })
    await checkRes(res3)
  }

  beforeAll(async () => {
    await fs.copy(
      join(next.testDir, 'test-file.txt'),
      join(next.testDir, '.next', 'test-file.txt')
    )
  })

  it('should serve file with space correctly from public/', async () => {
    const res = await next.fetch('/hello world.txt')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hi')
  })

  it('should serve file with space correctly static/', async () => {
    const res = await next.fetch('/static/hello world.txt')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hi')
  })

  it('should serve avif image with correct content-type', async () => {
    // vercel-icon-dark.avif is downloaded from https://vercel.com/design and transformed to avif on avif.io
    const res = await next.fetch('/vercel-icon-dark.avif')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/avif')
  })

  it('should serve correct error code', async () => {
    // vercel-icon-dark.avif is downloaded from https://vercel.com/design and transformed to avif on avif.io
    const res = await next.fetch('/vercel-icon-dark.avif', {
      headers: {
        Range: 'bytes=1000000000-',
      },
    })
    expect(res.status).toBe(416) // 416 Range Not Satisfiable
  })

  // checks against traversal requests from
  // https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/Directory%20Traversal/Intruder/traversals-8-deep-exotic-encoding.txt

  it('should prevent traversing with /../test-file.txt', async () => {
    await expectStatus('/../test-file.txt')
  })

  it('should prevent traversing with /../../test-file.txt', async () => {
    await expectStatus('/../../test-file.txt')
  })

  it('should prevent traversing with /../../../test-file.txt', async () => {
    await expectStatus('/../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../test-file.txt', async () => {
    await expectStatus('/../../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../../test-file.txt', async () => {
    await expectStatus('/../../../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../../../test-file.txt', async () => {
    await expectStatus('/../../../../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../../../../test-file.txt', async () => {
    await expectStatus('/../../../../../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../../../../../test-file.txt', async () => {
    await expectStatus('/../../../../../../../../test-file.txt')
  })

  it('should prevent traversing with /..%2ftest-file.txt', async () => {
    await expectStatus('/..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/%2e%2e/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('/%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('/%2e%2e%2f%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('/%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /..%252ftest-file.txt', async () => {
    await expectStatus('/..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252ftest-file.txt', async () => {
    await expectStatus('/..%252f..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus('/..%252f..%252f..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus('/..%252f..%252f..%252f..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus('/..%252f..%252f..%252f..%252f..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus(
      '/..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus(
      '/..%252f..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus(
      '/..%252f..%252f..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/test-file.txt', async () => {
    await expectStatus('/%252e%252e/test-file.txt')
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus('/%252e%252e/%252e%252e/test-file.txt')
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus('/%252e%252e/%252e%252e/%252e%252e/test-file.txt')
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252ftest-file.txt', async () => {
    await expectStatus('/%252e%252e%252ftest-file.txt')
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus('/%252e%252e%252f%252e%252e%252ftest-file.txt')
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /..\\test-file.txt', async () => {
    await expectStatus('/..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..%255ctest-file.txt', async () => {
    await expectStatus('/..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255ctest-file.txt', async () => {
    await expectStatus('/..%255c..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus('/..%255c..%255c..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus('/..%255c..%255c..%255c..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus('/..%255c..%255c..%255c..%255c..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus(
      '/..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus(
      '/..%255c..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus(
      '/..%255c..%255c..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/%2e%2e%5c%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\test-file.txt', async () => {
    await expectStatus('/%252e%252e\\test-file.txt')
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus('/%252e%252e\\%252e%252e\\test-file.txt')
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus('/%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt')
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255ctest-file.txt', async () => {
    await expectStatus('/%252e%252e%255ctest-file.txt')
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus('/%252e%252e%255c%252e%252e%255ctest-file.txt')
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%c0%aftest-file.txt', async () => {
    await expectStatus('/..%c0%aftest-file.txt')
  })

  it('should prevent traversing with /..%c0%af..%c0%aftest-file.txt', async () => {
    await expectStatus('/..%c0%af..%c0%aftest-file.txt')
  })

  it('should prevent traversing with /..%c0%af..%c0%af..%c0%aftest-file.txt', async () => {
    await expectStatus('/..%c0%af..%c0%af..%c0%aftest-file.txt')
  })

  it('should prevent traversing with /..%c0%af..%c0%af..%c0%af..%c0%aftest-file.txt', async () => {
    await expectStatus('/..%c0%af..%c0%af..%c0%af..%c0%aftest-file.txt')
  })

  it('should prevent traversing with /..%c0%af..%c0%af..%c0%af..%c0%af..%c0%aftest-file.txt', async () => {
    await expectStatus('/..%c0%af..%c0%af..%c0%af..%c0%af..%c0%aftest-file.txt')
  })

  it('should prevent traversing with /..%c0%af..%c0%af..%c0%af..%c0%af..%c0%af..%c0%aftest-file.txt', async () => {
    await expectStatus(
      '/..%c0%af..%c0%af..%c0%af..%c0%af..%c0%af..%c0%aftest-file.txt'
    )
  })

  it('should prevent traversing with /..%c0%af..%c0%af..%c0%af..%c0%af..%c0%af..%c0%af..%c0%aftest-file.txt', async () => {
    await expectStatus(
      '/..%c0%af..%c0%af..%c0%af..%c0%af..%c0%af..%c0%af..%c0%aftest-file.txt'
    )
  })

  it('should prevent traversing with /..%c0%af..%c0%af..%c0%af..%c0%af..%c0%af..%c0%af..%c0%af..%c0%aftest-file.txt', async () => {
    await expectStatus(
      '/..%c0%af..%c0%af..%c0%af..%c0%af..%c0%af..%c0%af..%c0%af..%c0%aftest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae/test-file.txt', async () => {
    await expectStatus('/%c0%ae%c0%ae/test-file.txt')
  })

  it('should prevent traversing with /%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt', async () => {
    await expectStatus('/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt')
  })

  it('should prevent traversing with /%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt', async () => {
    await expectStatus('/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt')
  })

  it('should prevent traversing with /%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c0%aftest-file.txt', async () => {
    await expectStatus('/%c0%ae%c0%ae%c0%aftest-file.txt')
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt', async () => {
    await expectStatus('/%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt')
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%af%c0%ae%c0%ae%c0%aftest-file.txt'
    )
  })

  it('should prevent traversing with /..%25c0%25aftest-file.txt', async () => {
    await expectStatus('/..%25c0%25aftest-file.txt')
  })

  it('should prevent traversing with /..%25c0%25af..%25c0%25aftest-file.txt', async () => {
    await expectStatus('/..%25c0%25af..%25c0%25aftest-file.txt')
  })

  it('should prevent traversing with /..%25c0%25af..%25c0%25af..%25c0%25aftest-file.txt', async () => {
    await expectStatus('/..%25c0%25af..%25c0%25af..%25c0%25aftest-file.txt')
  })

  it('should prevent traversing with /..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25aftest-file.txt', async () => {
    await expectStatus(
      '/..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25aftest-file.txt'
    )
  })

  it('should prevent traversing with /..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25aftest-file.txt', async () => {
    await expectStatus(
      '/..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25aftest-file.txt'
    )
  })

  it('should prevent traversing with /..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25aftest-file.txt', async () => {
    await expectStatus(
      '/..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25aftest-file.txt'
    )
  })

  it('should prevent traversing with /..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25aftest-file.txt', async () => {
    await expectStatus(
      '/..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25aftest-file.txt'
    )
  })

  it('should prevent traversing with /..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25aftest-file.txt', async () => {
    await expectStatus(
      '/..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25af..%25c0%25aftest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae/test-file.txt', async () => {
    await expectStatus('/%25c0%25ae%25c0%25ae/test-file.txt')
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/%25c0%25ae%25c0%25ae/test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt', async () => {
    await expectStatus('/%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt')
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25af%25c0%25ae%25c0%25ae%25c0%25aftest-file.txt'
    )
  })

  it('should prevent traversing with /..%c1%9ctest-file.txt', async () => {
    await expectStatus('/..%c1%9ctest-file.txt')
  })

  it('should prevent traversing with /..%c1%9c..%c1%9ctest-file.txt', async () => {
    await expectStatus('/..%c1%9c..%c1%9ctest-file.txt')
  })

  it('should prevent traversing with /..%c1%9c..%c1%9c..%c1%9ctest-file.txt', async () => {
    await expectStatus('/..%c1%9c..%c1%9c..%c1%9ctest-file.txt')
  })

  it('should prevent traversing with /..%c1%9c..%c1%9c..%c1%9c..%c1%9ctest-file.txt', async () => {
    await expectStatus('/..%c1%9c..%c1%9c..%c1%9c..%c1%9ctest-file.txt')
  })

  it('should prevent traversing with /..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9ctest-file.txt', async () => {
    await expectStatus('/..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9ctest-file.txt')
  })

  it('should prevent traversing with /..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9ctest-file.txt', async () => {
    await expectStatus(
      '/..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9ctest-file.txt', async () => {
    await expectStatus(
      '/..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9ctest-file.txt', async () => {
    await expectStatus(
      '/..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9c..%c1%9ctest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae\\test-file.txt', async () => {
    await expectStatus('/%c0%ae%c0%ae\\test-file.txt')
  })

  it('should prevent traversing with /%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt', async () => {
    await expectStatus('/%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt')
  })

  it('should prevent traversing with /%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\%c0%ae%c0%ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c1%9ctest-file.txt', async () => {
    await expectStatus('/%c0%ae%c0%ae%c1%9ctest-file.txt')
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt', async () => {
    await expectStatus('/%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt')
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt', async () => {
    await expectStatus(
      '/%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9c%c0%ae%c0%ae%c1%9ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%25c1%259ctest-file.txt', async () => {
    await expectStatus('/..%25c1%259ctest-file.txt')
  })

  it('should prevent traversing with /..%25c1%259c..%25c1%259ctest-file.txt', async () => {
    await expectStatus('/..%25c1%259c..%25c1%259ctest-file.txt')
  })

  it('should prevent traversing with /..%25c1%259c..%25c1%259c..%25c1%259ctest-file.txt', async () => {
    await expectStatus('/..%25c1%259c..%25c1%259c..%25c1%259ctest-file.txt')
  })

  it('should prevent traversing with /..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259ctest-file.txt', async () => {
    await expectStatus(
      '/..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259ctest-file.txt', async () => {
    await expectStatus(
      '/..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259ctest-file.txt', async () => {
    await expectStatus(
      '/..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259ctest-file.txt', async () => {
    await expectStatus(
      '/..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259ctest-file.txt', async () => {
    await expectStatus(
      '/..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259c..%25c1%259ctest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae\\test-file.txt', async () => {
    await expectStatus('/%25c0%25ae%25c0%25ae\\test-file.txt')
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\%25c0%25ae%25c0%25ae\\test-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt', async () => {
    await expectStatus('/%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt')
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt'
    )
  })

  it('should prevent traversing with /%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt', async () => {
    await expectStatus(
      '/%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259c%25c0%25ae%25c0%25ae%25c1%259ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%%32%66test-file.txt', async () => {
    await expectStatus('/..%%32%66test-file.txt')
  })

  it('should prevent traversing with /..%%32%66..%%32%66test-file.txt', async () => {
    await expectStatus('/..%%32%66..%%32%66test-file.txt')
  })

  it('should prevent traversing with /..%%32%66..%%32%66..%%32%66test-file.txt', async () => {
    await expectStatus('/..%%32%66..%%32%66..%%32%66test-file.txt')
  })

  it('should prevent traversing with /..%%32%66..%%32%66..%%32%66..%%32%66test-file.txt', async () => {
    await expectStatus('/..%%32%66..%%32%66..%%32%66..%%32%66test-file.txt')
  })

  it('should prevent traversing with /..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66test-file.txt', async () => {
    await expectStatus(
      '/..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66test-file.txt'
    )
  })

  it('should prevent traversing with /..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66test-file.txt', async () => {
    await expectStatus(
      '/..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66test-file.txt'
    )
  })

  it('should prevent traversing with /..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66test-file.txt', async () => {
    await expectStatus(
      '/..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66test-file.txt'
    )
  })

  it('should prevent traversing with /..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66test-file.txt', async () => {
    await expectStatus(
      '/..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66..%%32%66test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus('/%%32%65%%32%65/test-file.txt')
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus('/%%32%65%%32%65/%%32%65%%32%65/test-file.txt')
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%32%66test-file.txt', async () => {
    await expectStatus('/%%32%65%%32%65%%32%66test-file.txt')
  })

  it('should prevent traversing with /%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66%%32%65%%32%65%%32%66test-file.txt'
    )
  })

  it('should prevent traversing with /..%%35%63test-file.txt', async () => {
    await expectStatus('/..%%35%63test-file.txt')
  })

  it('should prevent traversing with /..%%35%63..%%35%63test-file.txt', async () => {
    await expectStatus('/..%%35%63..%%35%63test-file.txt')
  })

  it('should prevent traversing with /..%%35%63..%%35%63..%%35%63test-file.txt', async () => {
    await expectStatus('/..%%35%63..%%35%63..%%35%63test-file.txt')
  })

  it('should prevent traversing with /..%%35%63..%%35%63..%%35%63..%%35%63test-file.txt', async () => {
    await expectStatus('/..%%35%63..%%35%63..%%35%63..%%35%63test-file.txt')
  })

  it('should prevent traversing with /..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63test-file.txt', async () => {
    await expectStatus(
      '/..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63test-file.txt'
    )
  })

  it('should prevent traversing with /..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63test-file.txt', async () => {
    await expectStatus(
      '/..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63test-file.txt'
    )
  })

  it('should prevent traversing with /..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63test-file.txt', async () => {
    await expectStatus(
      '/..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63test-file.txt'
    )
  })

  it('should prevent traversing with /..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63test-file.txt', async () => {
    await expectStatus(
      '/..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63..%%35%63test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus('/%%32%65%%32%65/test-file.txt')
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus('/%%32%65%%32%65/%%32%65%%32%65/test-file.txt')
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%35%63test-file.txt', async () => {
    await expectStatus('/%%32%65%%32%65%%35%63test-file.txt')
  })

  it('should prevent traversing with /%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt'
    )
  })

  it('should prevent traversing with /%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt', async () => {
    await expectStatus(
      '/%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63%%32%65%%32%65%%35%63test-file.txt'
    )
  })

  it('should prevent traversing with /../test-file.txt', async () => {
    await expectStatus('/../test-file.txt')
  })

  it('should prevent traversing with /../../test-file.txt', async () => {
    await expectStatus('/../../test-file.txt')
  })

  it('should prevent traversing with /../../../test-file.txt', async () => {
    await expectStatus('/../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../test-file.txt', async () => {
    await expectStatus('/../../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../../test-file.txt', async () => {
    await expectStatus('/../../../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../../../test-file.txt', async () => {
    await expectStatus('/../../../../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../../../../test-file.txt', async () => {
    await expectStatus('/../../../../../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../../../../../test-file.txt', async () => {
    await expectStatus('/../../../../../../../../test-file.txt')
  })

  it('should prevent traversing with /..%2ftest-file.txt', async () => {
    await expectStatus('/..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/%2e%2e/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('/%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('/%2e%2e%2f%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('/%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /..%252ftest-file.txt', async () => {
    await expectStatus('/..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252ftest-file.txt', async () => {
    await expectStatus('/..%252f..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus('/..%252f..%252f..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus('/..%252f..%252f..%252f..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus('/..%252f..%252f..%252f..%252f..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus(
      '/..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus(
      '/..%252f..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus(
      '/..%252f..%252f..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/test-file.txt', async () => {
    await expectStatus('/%252e%252e/test-file.txt')
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus('/%252e%252e/%252e%252e/test-file.txt')
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus('/%252e%252e/%252e%252e/%252e%252e/test-file.txt')
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252ftest-file.txt', async () => {
    await expectStatus('/%252e%252e%252ftest-file.txt')
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus('/%252e%252e%252f%252e%252e%252ftest-file.txt')
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /..\\test-file.txt', async () => {
    await expectStatus('/..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..%5ctest-file.txt', async () => {
    await expectStatus('/..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/%2e%2e%5c%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%255ctest-file.txt', async () => {
    await expectStatus('/..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255ctest-file.txt', async () => {
    await expectStatus('/..%255c..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus('/..%255c..%255c..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus('/..%255c..%255c..%255c..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus('/..%255c..%255c..%255c..%255c..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus(
      '/..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus(
      '/..%255c..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus(
      '/..%255c..%255c..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\test-file.txt', async () => {
    await expectStatus('/%252e%252e\\test-file.txt')
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus('/%252e%252e\\%252e%252e\\test-file.txt')
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus('/%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt')
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255ctest-file.txt', async () => {
    await expectStatus('/%252e%252e%255ctest-file.txt')
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus('/%252e%252e%255c%252e%252e%255ctest-file.txt')
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /../test-file.txt', async () => {
    await expectStatus('/../test-file.txt')
  })

  it('should prevent traversing with /../../test-file.txt', async () => {
    await expectStatus('/../../test-file.txt')
  })

  it('should prevent traversing with /../../../test-file.txt', async () => {
    await expectStatus('/../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../test-file.txt', async () => {
    await expectStatus('/../../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../../test-file.txt', async () => {
    await expectStatus('/../../../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../../../test-file.txt', async () => {
    await expectStatus('/../../../../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../../../../test-file.txt', async () => {
    await expectStatus('/../../../../../../../test-file.txt')
  })

  it('should prevent traversing with /../../../../../../../../test-file.txt', async () => {
    await expectStatus('/../../../../../../../../test-file.txt')
  })

  it('should prevent traversing with /..%2ftest-file.txt', async () => {
    await expectStatus('/..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /..%2f..%2f..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt', async () => {
    await expectStatus('/..%2f..%2f..%2f..%2f..%2f..%2f..%2f..%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/%2e%2e/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus('/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt')
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('/%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('/%2e%2e%2f%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('/%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /..%252ftest-file.txt', async () => {
    await expectStatus('/..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252ftest-file.txt', async () => {
    await expectStatus('/..%252f..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus('/..%252f..%252f..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus('/..%252f..%252f..%252f..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus('/..%252f..%252f..%252f..%252f..%252ftest-file.txt')
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus(
      '/..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus(
      '/..%252f..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /..%252f..%252f..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt', async () => {
    await expectStatus(
      '/..%252f..%252f..%252f..%252f..%252f..%252f..%252f..%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/test-file.txt', async () => {
    await expectStatus('/%252e%252e/test-file.txt')
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus('/%252e%252e/%252e%252e/test-file.txt')
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus('/%252e%252e/%252e%252e/%252e%252e/test-file.txt')
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/%252e%252e/test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252ftest-file.txt', async () => {
    await expectStatus('/%252e%252e%252ftest-file.txt')
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus('/%252e%252e%252f%252e%252e%252ftest-file.txt')
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252f%252e%252e%252ftest-file.txt'
    )
  })

  it('should prevent traversing with /..\\test-file.txt', async () => {
    await expectStatus('/..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\..\\..\\..\\..\\..\\..\\test-file.txt')
  })

  it('should prevent traversing with /..%5ctest-file.txt', async () => {
    await expectStatus('/..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /..%5c..%5c..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt', async () => {
    await expectStatus('/..%5c..%5c..%5c..%5c..%5c..%5c..%5c..%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus('/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt')
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\%2e%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/%2e%2e%5c%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%255ctest-file.txt', async () => {
    await expectStatus('/..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255ctest-file.txt', async () => {
    await expectStatus('/..%255c..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus('/..%255c..%255c..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus('/..%255c..%255c..%255c..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus('/..%255c..%255c..%255c..%255c..%255ctest-file.txt')
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus(
      '/..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus(
      '/..%255c..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%255c..%255c..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt', async () => {
    await expectStatus(
      '/..%255c..%255c..%255c..%255c..%255c..%255c..%255c..%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\test-file.txt', async () => {
    await expectStatus('/%252e%252e\\test-file.txt')
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus('/%252e%252e\\%252e%252e\\test-file.txt')
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus('/%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt')
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt', async () => {
    await expectStatus(
      '/%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\%252e%252e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255ctest-file.txt', async () => {
    await expectStatus('/%252e%252e%255ctest-file.txt')
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus('/%252e%252e%255c%252e%252e%255ctest-file.txt')
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt', async () => {
    await expectStatus(
      '/%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255c%252e%252e%255ctest-file.txt'
    )
  })

  it('should prevent traversing with /\\../test-file.txt', async () => {
    await expectStatus('/\\../test-file.txt')
  })

  it('should prevent traversing with /\\../\\../test-file.txt', async () => {
    await expectStatus('/\\../\\../test-file.txt')
  })

  it('should prevent traversing with /\\../\\../\\../test-file.txt', async () => {
    await expectStatus('/\\../\\../\\../test-file.txt')
  })

  it('should prevent traversing with /\\../\\../\\../\\../test-file.txt', async () => {
    await expectStatus('/\\../\\../\\../\\../test-file.txt')
  })

  it('should prevent traversing with /\\../\\../\\../\\../\\../test-file.txt', async () => {
    await expectStatus('/\\../\\../\\../\\../\\../test-file.txt')
  })

  it('should prevent traversing with /\\../\\../\\../\\../\\../\\../test-file.txt', async () => {
    await expectStatus('/\\../\\../\\../\\../\\../\\../test-file.txt')
  })

  it('should prevent traversing with /\\../\\../\\../\\../\\../\\../\\../test-file.txt', async () => {
    await expectStatus('/\\../\\../\\../\\../\\../\\../\\../test-file.txt')
  })

  it('should prevent traversing with /\\../\\../\\../\\../\\../\\../\\../\\../test-file.txt', async () => {
    await expectStatus('/\\../\\../\\../\\../\\../\\../\\../\\../test-file.txt')
  })

  it('should prevent traversing with //..\\test-file.txt', async () => {
    await expectStatus('//..\\test-file.txt')
  })

  it('should prevent traversing with //..\\/..\\test-file.txt', async () => {
    await expectStatus('//..\\/..\\test-file.txt')
  })

  it('should prevent traversing with //..\\/..\\/..\\test-file.txt', async () => {
    await expectStatus('//..\\/..\\/..\\test-file.txt')
  })

  it('should prevent traversing with //..\\/..\\/..\\/..\\test-file.txt', async () => {
    await expectStatus('//..\\/..\\/..\\/..\\test-file.txt')
  })

  it('should prevent traversing with //..\\/..\\/..\\/..\\/..\\test-file.txt', async () => {
    await expectStatus('//..\\/..\\/..\\/..\\/..\\test-file.txt')
  })

  it('should prevent traversing with //..\\/..\\/..\\/..\\/..\\/..\\test-file.txt', async () => {
    await expectStatus('//..\\/..\\/..\\/..\\/..\\/..\\test-file.txt')
  })

  it('should prevent traversing with //..\\/..\\/..\\/..\\/..\\/..\\/..\\test-file.txt', async () => {
    await expectStatus('//..\\/..\\/..\\/..\\/..\\/..\\/..\\test-file.txt')
  })

  it('should prevent traversing with //..\\/..\\/..\\/..\\/..\\/..\\/..\\/..\\test-file.txt', async () => {
    await expectStatus('//..\\/..\\/..\\/..\\/..\\/..\\/..\\/..\\test-file.txt')
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../../../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../../../../test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../../../../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\..\\..\\..\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /.../test-file.txt', async () => {
    await expectStatus('/.../test-file.txt')
  })

  it('should prevent traversing with /.../.../test-file.txt', async () => {
    await expectStatus('/.../.../test-file.txt')
  })

  it('should prevent traversing with /.../.../.../test-file.txt', async () => {
    await expectStatus('/.../.../.../test-file.txt')
  })

  it('should prevent traversing with /.../.../.../.../test-file.txt', async () => {
    await expectStatus('/.../.../.../.../test-file.txt')
  })

  it('should prevent traversing with /.../.../.../.../.../test-file.txt', async () => {
    await expectStatus('/.../.../.../.../.../test-file.txt')
  })

  it('should prevent traversing with /.../.../.../.../.../.../test-file.txt', async () => {
    await expectStatus('/.../.../.../.../.../.../test-file.txt')
  })

  it('should prevent traversing with /.../.../.../.../.../.../.../test-file.txt', async () => {
    await expectStatus('/.../.../.../.../.../.../.../test-file.txt')
  })

  it('should prevent traversing with /.../.../.../.../.../.../.../.../test-file.txt', async () => {
    await expectStatus('/.../.../.../.../.../.../.../.../test-file.txt')
  })

  it('should prevent traversing with /...\\test-file.txt', async () => {
    await expectStatus('/...\\test-file.txt')
  })

  it('should prevent traversing with /...\\...\\test-file.txt', async () => {
    await expectStatus('/...\\...\\test-file.txt')
  })

  it('should prevent traversing with /...\\...\\...\\test-file.txt', async () => {
    await expectStatus('/...\\...\\...\\test-file.txt')
  })

  it('should prevent traversing with /...\\...\\...\\...\\test-file.txt', async () => {
    await expectStatus('/...\\...\\...\\...\\test-file.txt')
  })

  it('should prevent traversing with /...\\...\\...\\...\\...\\test-file.txt', async () => {
    await expectStatus('/...\\...\\...\\...\\...\\test-file.txt')
  })

  it('should prevent traversing with /...\\...\\...\\...\\...\\...\\test-file.txt', async () => {
    await expectStatus('/...\\...\\...\\...\\...\\...\\test-file.txt')
  })

  it('should prevent traversing with /...\\...\\...\\...\\...\\...\\...\\test-file.txt', async () => {
    await expectStatus('/...\\...\\...\\...\\...\\...\\...\\test-file.txt')
  })

  it('should prevent traversing with /...\\...\\...\\...\\...\\...\\...\\...\\test-file.txt', async () => {
    await expectStatus('/...\\...\\...\\...\\...\\...\\...\\...\\test-file.txt')
  })

  it('should prevent traversing with /..../test-file.txt', async () => {
    await expectStatus('/..../test-file.txt')
  })

  it('should prevent traversing with /..../..../test-file.txt', async () => {
    await expectStatus('/..../..../test-file.txt')
  })

  it('should prevent traversing with /..../..../..../test-file.txt', async () => {
    await expectStatus('/..../..../..../test-file.txt')
  })

  it('should prevent traversing with /..../..../..../..../test-file.txt', async () => {
    await expectStatus('/..../..../..../..../test-file.txt')
  })

  it('should prevent traversing with /..../..../..../..../..../test-file.txt', async () => {
    await expectStatus('/..../..../..../..../..../test-file.txt')
  })

  it('should prevent traversing with /..../..../..../..../..../..../test-file.txt', async () => {
    await expectStatus('/..../..../..../..../..../..../test-file.txt')
  })

  it('should prevent traversing with /..../..../..../..../..../..../..../test-file.txt', async () => {
    await expectStatus('/..../..../..../..../..../..../..../test-file.txt')
  })

  it('should prevent traversing with /..../..../..../..../..../..../..../..../test-file.txt', async () => {
    await expectStatus('/..../..../..../..../..../..../..../..../test-file.txt')
  })

  it('should prevent traversing with /....\\test-file.txt', async () => {
    await expectStatus('/....\\test-file.txt')
  })

  it('should prevent traversing with /....\\....\\test-file.txt', async () => {
    await expectStatus('/....\\....\\test-file.txt')
  })

  it('should prevent traversing with /....\\....\\....\\test-file.txt', async () => {
    await expectStatus('/....\\....\\....\\test-file.txt')
  })

  it('should prevent traversing with /....\\....\\....\\....\\test-file.txt', async () => {
    await expectStatus('/....\\....\\....\\....\\test-file.txt')
  })

  it('should prevent traversing with /....\\....\\....\\....\\....\\test-file.txt', async () => {
    await expectStatus('/....\\....\\....\\....\\....\\test-file.txt')
  })

  it('should prevent traversing with /....\\....\\....\\....\\....\\....\\test-file.txt', async () => {
    await expectStatus('/....\\....\\....\\....\\....\\....\\test-file.txt')
  })

  it('should prevent traversing with /....\\....\\....\\....\\....\\....\\....\\test-file.txt', async () => {
    await expectStatus(
      '/....\\....\\....\\....\\....\\....\\....\\test-file.txt'
    )
  })

  it('should prevent traversing with /....\\....\\....\\....\\....\\....\\....\\....\\test-file.txt', async () => {
    await expectStatus(
      '/....\\....\\....\\....\\....\\....\\....\\....\\test-file.txt'
    )
  })

  it('should prevent traversing with /........................................................................../test-file.txt', async () => {
    await expectStatus(
      '/........................................................................../test-file.txt'
    )
  })

  it('should prevent traversing with /........................................................................../../test-file.txt', async () => {
    await expectStatus(
      '/........................................................................../../test-file.txt'
    )
  })

  it('should prevent traversing with /........................................................................../../../test-file.txt', async () => {
    await expectStatus(
      '/........................................................................../../../test-file.txt'
    )
  })

  it('should prevent traversing with /........................................................................../../../../test-file.txt', async () => {
    await expectStatus(
      '/........................................................................../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /........................................................................../../../../../test-file.txt', async () => {
    await expectStatus(
      '/........................................................................../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /........................................................................../../../../../../test-file.txt', async () => {
    await expectStatus(
      '/........................................................................../../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /........................................................................../../../../../../../test-file.txt', async () => {
    await expectStatus(
      '/........................................................................../../../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /........................................................................../../../../../../../../test-file.txt', async () => {
    await expectStatus(
      '/........................................................................../../../../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /..........................................................................\\test-file.txt', async () => {
    await expectStatus(
      '/..........................................................................\\test-file.txt'
    )
  })

  it('should prevent traversing with /..........................................................................\\..\\test-file.txt', async () => {
    await expectStatus(
      '/..........................................................................\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /..........................................................................\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/..........................................................................\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /..........................................................................\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/..........................................................................\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /..........................................................................\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/..........................................................................\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /..........................................................................\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/..........................................................................\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /..........................................................................\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/..........................................................................\\..\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /..........................................................................\\..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/..........................................................................\\..\\..\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /..%u2215test-file.txt', async () => {
    await expectStatus('/..%u2215test-file.txt')
  })

  it('should prevent traversing with /..%u2215..%u2215test-file.txt', async () => {
    await expectStatus('/..%u2215..%u2215test-file.txt')
  })

  it('should prevent traversing with /..%u2215..%u2215..%u2215test-file.txt', async () => {
    await expectStatus('/..%u2215..%u2215..%u2215test-file.txt')
  })

  it('should prevent traversing with /..%u2215..%u2215..%u2215..%u2215test-file.txt', async () => {
    await expectStatus('/..%u2215..%u2215..%u2215..%u2215test-file.txt')
  })

  it('should prevent traversing with /..%u2215..%u2215..%u2215..%u2215..%u2215test-file.txt', async () => {
    await expectStatus('/..%u2215..%u2215..%u2215..%u2215..%u2215test-file.txt')
  })

  it('should prevent traversing with /..%u2215..%u2215..%u2215..%u2215..%u2215..%u2215test-file.txt', async () => {
    await expectStatus(
      '/..%u2215..%u2215..%u2215..%u2215..%u2215..%u2215test-file.txt'
    )
  })

  it('should prevent traversing with /..%u2215..%u2215..%u2215..%u2215..%u2215..%u2215..%u2215test-file.txt', async () => {
    await expectStatus(
      '/..%u2215..%u2215..%u2215..%u2215..%u2215..%u2215..%u2215test-file.txt'
    )
  })

  it('should prevent traversing with /..%u2215..%u2215..%u2215..%u2215..%u2215..%u2215..%u2215..%u2215test-file.txt', async () => {
    await expectStatus(
      '/..%u2215..%u2215..%u2215..%u2215..%u2215..%u2215..%u2215..%u2215test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e/test-file.txt', async () => {
    await expectStatus('/%uff0e%uff0e/test-file.txt')
  })

  it('should prevent traversing with /%uff0e%uff0e/%uff0e%uff0e/test-file.txt', async () => {
    await expectStatus('/%uff0e%uff0e/%uff0e%uff0e/test-file.txt')
  })

  it('should prevent traversing with /%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/test-file.txt', async () => {
    await expectStatus('/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/test-file.txt')
  })

  it('should prevent traversing with /%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/%uff0e%uff0e/test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e%u2215test-file.txt', async () => {
    await expectStatus('/%uff0e%uff0e%u2215test-file.txt')
  })

  it('should prevent traversing with /%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt', async () => {
    await expectStatus('/%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt')
  })

  it('should prevent traversing with /%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215%uff0e%uff0e%u2215test-file.txt'
    )
  })

  it('should prevent traversing with /..%u2216test-file.txt', async () => {
    await expectStatus('/..%u2216test-file.txt')
  })

  it('should prevent traversing with /..%u2216..%u2216test-file.txt', async () => {
    await expectStatus('/..%u2216..%u2216test-file.txt')
  })

  it('should prevent traversing with /..%u2216..%u2216..%u2216test-file.txt', async () => {
    await expectStatus('/..%u2216..%u2216..%u2216test-file.txt')
  })

  it('should prevent traversing with /..%u2216..%u2216..%u2216..%u2216test-file.txt', async () => {
    await expectStatus('/..%u2216..%u2216..%u2216..%u2216test-file.txt')
  })

  it('should prevent traversing with /..%u2216..%u2216..%u2216..%u2216..%u2216test-file.txt', async () => {
    await expectStatus('/..%u2216..%u2216..%u2216..%u2216..%u2216test-file.txt')
  })

  it('should prevent traversing with /..%u2216..%u2216..%u2216..%u2216..%u2216..%u2216test-file.txt', async () => {
    await expectStatus(
      '/..%u2216..%u2216..%u2216..%u2216..%u2216..%u2216test-file.txt'
    )
  })

  it('should prevent traversing with /..%u2216..%u2216..%u2216..%u2216..%u2216..%u2216..%u2216test-file.txt', async () => {
    await expectStatus(
      '/..%u2216..%u2216..%u2216..%u2216..%u2216..%u2216..%u2216test-file.txt'
    )
  })

  it('should prevent traversing with /..%u2216..%u2216..%u2216..%u2216..%u2216..%u2216..%u2216..%u2216test-file.txt', async () => {
    await expectStatus(
      '/..%u2216..%u2216..%u2216..%u2216..%u2216..%u2216..%u2216..%u2216test-file.txt'
    )
  })

  it('should prevent traversing with /..%uEFC8test-file.txt', async () => {
    await expectStatus('/..%uEFC8test-file.txt')
  })

  it('should prevent traversing with /..%uEFC8..%uEFC8test-file.txt', async () => {
    await expectStatus('/..%uEFC8..%uEFC8test-file.txt')
  })

  it('should prevent traversing with /..%uEFC8..%uEFC8..%uEFC8test-file.txt', async () => {
    await expectStatus('/..%uEFC8..%uEFC8..%uEFC8test-file.txt')
  })

  it('should prevent traversing with /..%uEFC8..%uEFC8..%uEFC8..%uEFC8test-file.txt', async () => {
    await expectStatus('/..%uEFC8..%uEFC8..%uEFC8..%uEFC8test-file.txt')
  })

  it('should prevent traversing with /..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8test-file.txt', async () => {
    await expectStatus('/..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8test-file.txt')
  })

  it('should prevent traversing with /..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8test-file.txt', async () => {
    await expectStatus(
      '/..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8test-file.txt'
    )
  })

  it('should prevent traversing with /..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8test-file.txt', async () => {
    await expectStatus(
      '/..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8test-file.txt'
    )
  })

  it('should prevent traversing with /..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8test-file.txt', async () => {
    await expectStatus(
      '/..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8..%uEFC8test-file.txt'
    )
  })

  it('should prevent traversing with /..%uF025test-file.txt', async () => {
    await expectStatus('/..%uF025test-file.txt')
  })

  it('should prevent traversing with /..%uF025..%uF025test-file.txt', async () => {
    await expectStatus('/..%uF025..%uF025test-file.txt')
  })

  it('should prevent traversing with /..%uF025..%uF025..%uF025test-file.txt', async () => {
    await expectStatus('/..%uF025..%uF025..%uF025test-file.txt')
  })

  it('should prevent traversing with /..%uF025..%uF025..%uF025..%uF025test-file.txt', async () => {
    await expectStatus('/..%uF025..%uF025..%uF025..%uF025test-file.txt')
  })

  it('should prevent traversing with /..%uF025..%uF025..%uF025..%uF025..%uF025test-file.txt', async () => {
    await expectStatus('/..%uF025..%uF025..%uF025..%uF025..%uF025test-file.txt')
  })

  it('should prevent traversing with /..%uF025..%uF025..%uF025..%uF025..%uF025..%uF025test-file.txt', async () => {
    await expectStatus(
      '/..%uF025..%uF025..%uF025..%uF025..%uF025..%uF025test-file.txt'
    )
  })

  it('should prevent traversing with /..%uF025..%uF025..%uF025..%uF025..%uF025..%uF025..%uF025test-file.txt', async () => {
    await expectStatus(
      '/..%uF025..%uF025..%uF025..%uF025..%uF025..%uF025..%uF025test-file.txt'
    )
  })

  it('should prevent traversing with /..%uF025..%uF025..%uF025..%uF025..%uF025..%uF025..%uF025..%uF025test-file.txt', async () => {
    await expectStatus(
      '/..%uF025..%uF025..%uF025..%uF025..%uF025..%uF025..%uF025..%uF025test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e\\test-file.txt', async () => {
    await expectStatus('/%uff0e%uff0e\\test-file.txt')
  })

  it('should prevent traversing with /%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt', async () => {
    await expectStatus('/%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt')
  })

  it('should prevent traversing with /%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\%uff0e%uff0e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e%u2216test-file.txt', async () => {
    await expectStatus('/%uff0e%uff0e%u2216test-file.txt')
  })

  it('should prevent traversing with /%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt', async () => {
    await expectStatus('/%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt')
  })

  it('should prevent traversing with /%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt'
    )
  })

  it('should prevent traversing with /%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt', async () => {
    await expectStatus(
      '/%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216%uff0e%uff0e%u2216test-file.txt'
    )
  })

  it('should prevent traversing with /..0x2ftest-file.txt', async () => {
    await expectStatus('/..0x2ftest-file.txt')
  })

  it('should prevent traversing with /..0x2f..0x2ftest-file.txt', async () => {
    await expectStatus('/..0x2f..0x2ftest-file.txt')
  })

  it('should prevent traversing with /..0x2f..0x2f..0x2ftest-file.txt', async () => {
    await expectStatus('/..0x2f..0x2f..0x2ftest-file.txt')
  })

  it('should prevent traversing with /..0x2f..0x2f..0x2f..0x2ftest-file.txt', async () => {
    await expectStatus('/..0x2f..0x2f..0x2f..0x2ftest-file.txt')
  })

  it('should prevent traversing with /..0x2f..0x2f..0x2f..0x2f..0x2ftest-file.txt', async () => {
    await expectStatus('/..0x2f..0x2f..0x2f..0x2f..0x2ftest-file.txt')
  })

  it('should prevent traversing with /..0x2f..0x2f..0x2f..0x2f..0x2f..0x2ftest-file.txt', async () => {
    await expectStatus('/..0x2f..0x2f..0x2f..0x2f..0x2f..0x2ftest-file.txt')
  })

  it('should prevent traversing with /..0x2f..0x2f..0x2f..0x2f..0x2f..0x2f..0x2ftest-file.txt', async () => {
    await expectStatus(
      '/..0x2f..0x2f..0x2f..0x2f..0x2f..0x2f..0x2ftest-file.txt'
    )
  })

  it('should prevent traversing with /..0x2f..0x2f..0x2f..0x2f..0x2f..0x2f..0x2f..0x2ftest-file.txt', async () => {
    await expectStatus(
      '/..0x2f..0x2f..0x2f..0x2f..0x2f..0x2f..0x2f..0x2ftest-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e/test-file.txt', async () => {
    await expectStatus('/0x2e0x2e/test-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e/0x2e0x2e/test-file.txt', async () => {
    await expectStatus('/0x2e0x2e/0x2e0x2e/test-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e/0x2e0x2e/0x2e0x2e/test-file.txt', async () => {
    await expectStatus('/0x2e0x2e/0x2e0x2e/0x2e0x2e/test-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/test-file.txt', async () => {
    await expectStatus('/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/test-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/test-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/test-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/test-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/test-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/test-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/test-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/test-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/0x2e0x2e/test-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e0x2ftest-file.txt', async () => {
    await expectStatus('/0x2e0x2e0x2ftest-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt', async () => {
    await expectStatus('/0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt', async () => {
    await expectStatus('/0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2f0x2e0x2e0x2ftest-file.txt'
    )
  })

  it('should prevent traversing with /..0x5ctest-file.txt', async () => {
    await expectStatus('/..0x5ctest-file.txt')
  })

  it('should prevent traversing with /..0x5c..0x5ctest-file.txt', async () => {
    await expectStatus('/..0x5c..0x5ctest-file.txt')
  })

  it('should prevent traversing with /..0x5c..0x5c..0x5ctest-file.txt', async () => {
    await expectStatus('/..0x5c..0x5c..0x5ctest-file.txt')
  })

  it('should prevent traversing with /..0x5c..0x5c..0x5c..0x5ctest-file.txt', async () => {
    await expectStatus('/..0x5c..0x5c..0x5c..0x5ctest-file.txt')
  })

  it('should prevent traversing with /..0x5c..0x5c..0x5c..0x5c..0x5ctest-file.txt', async () => {
    await expectStatus('/..0x5c..0x5c..0x5c..0x5c..0x5ctest-file.txt')
  })

  it('should prevent traversing with /..0x5c..0x5c..0x5c..0x5c..0x5c..0x5ctest-file.txt', async () => {
    await expectStatus('/..0x5c..0x5c..0x5c..0x5c..0x5c..0x5ctest-file.txt')
  })

  it('should prevent traversing with /..0x5c..0x5c..0x5c..0x5c..0x5c..0x5c..0x5ctest-file.txt', async () => {
    await expectStatus(
      '/..0x5c..0x5c..0x5c..0x5c..0x5c..0x5c..0x5ctest-file.txt'
    )
  })

  it('should prevent traversing with /..0x5c..0x5c..0x5c..0x5c..0x5c..0x5c..0x5c..0x5ctest-file.txt', async () => {
    await expectStatus(
      '/..0x5c..0x5c..0x5c..0x5c..0x5c..0x5c..0x5c..0x5ctest-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e\\test-file.txt', async () => {
    await expectStatus('/0x2e0x2e\\test-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e\\0x2e0x2e\\test-file.txt', async () => {
    await expectStatus('/0x2e0x2e\\0x2e0x2e\\test-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\test-file.txt', async () => {
    await expectStatus('/0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\test-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\test-file.txt', async () => {
    await expectStatus('/0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\test-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\test-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\test-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\test-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\test-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\0x2e0x2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e0x5ctest-file.txt', async () => {
    await expectStatus('/0x2e0x2e0x5ctest-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt', async () => {
    await expectStatus('/0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt', async () => {
    await expectStatus('/0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt')
  })

  it('should prevent traversing with /0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt'
    )
  })

  it('should prevent traversing with /0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt', async () => {
    await expectStatus(
      '/0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5c0x2e0x2e0x5ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%c0%2ftest-file.txt', async () => {
    await expectStatus('/..%c0%2ftest-file.txt')
  })

  it('should prevent traversing with /..%c0%2f..%c0%2ftest-file.txt', async () => {
    await expectStatus('/..%c0%2f..%c0%2ftest-file.txt')
  })

  it('should prevent traversing with /..%c0%2f..%c0%2f..%c0%2ftest-file.txt', async () => {
    await expectStatus('/..%c0%2f..%c0%2f..%c0%2ftest-file.txt')
  })

  it('should prevent traversing with /..%c0%2f..%c0%2f..%c0%2f..%c0%2ftest-file.txt', async () => {
    await expectStatus('/..%c0%2f..%c0%2f..%c0%2f..%c0%2ftest-file.txt')
  })

  it('should prevent traversing with /..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2ftest-file.txt', async () => {
    await expectStatus('/..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2ftest-file.txt')
  })

  it('should prevent traversing with /..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2ftest-file.txt', async () => {
    await expectStatus(
      '/..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2ftest-file.txt', async () => {
    await expectStatus(
      '/..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2ftest-file.txt', async () => {
    await expectStatus(
      '/..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2f..%c0%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e/test-file.txt', async () => {
    await expectStatus('/%c0%2e%c0%2e/test-file.txt')
  })

  it('should prevent traversing with /%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt', async () => {
    await expectStatus('/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt')
  })

  it('should prevent traversing with /%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt', async () => {
    await expectStatus('/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt')
  })

  it('should prevent traversing with /%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/%c0%2e%c0%2e/test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%2ftest-file.txt', async () => {
    await expectStatus('/%c0%2e%c0%2e%c0%2ftest-file.txt')
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt', async () => {
    await expectStatus('/%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt')
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2f%c0%2e%c0%2e%c0%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /..%c0%5ctest-file.txt', async () => {
    await expectStatus('/..%c0%5ctest-file.txt')
  })

  it('should prevent traversing with /..%c0%5c..%c0%5ctest-file.txt', async () => {
    await expectStatus('/..%c0%5c..%c0%5ctest-file.txt')
  })

  it('should prevent traversing with /..%c0%5c..%c0%5c..%c0%5ctest-file.txt', async () => {
    await expectStatus('/..%c0%5c..%c0%5c..%c0%5ctest-file.txt')
  })

  it('should prevent traversing with /..%c0%5c..%c0%5c..%c0%5c..%c0%5ctest-file.txt', async () => {
    await expectStatus('/..%c0%5c..%c0%5c..%c0%5c..%c0%5ctest-file.txt')
  })

  it('should prevent traversing with /..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5ctest-file.txt', async () => {
    await expectStatus('/..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5ctest-file.txt')
  })

  it('should prevent traversing with /..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5ctest-file.txt', async () => {
    await expectStatus(
      '/..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5ctest-file.txt', async () => {
    await expectStatus(
      '/..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5ctest-file.txt', async () => {
    await expectStatus(
      '/..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5c..%c0%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e\\test-file.txt', async () => {
    await expectStatus('/%c0%2e%c0%2e\\test-file.txt')
  })

  it('should prevent traversing with /%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt', async () => {
    await expectStatus('/%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt')
  })

  it('should prevent traversing with /%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\%c0%2e%c0%2e\\test-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%5ctest-file.txt', async () => {
    await expectStatus('/%c0%2e%c0%2e%c0%5ctest-file.txt')
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt', async () => {
    await expectStatus('/%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt')
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt', async () => {
    await expectStatus(
      '/%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5c%c0%2e%c0%2e%c0%5ctest-file.txt'
    )
  })

  it('should prevent traversing with ////%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('////%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with ////%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('////%2e%2e%2f%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with ////%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('////%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with ////%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus('////%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt')
  })

  it('should prevent traversing with ////%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '////%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with ////%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '////%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with ////%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '////%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with ////%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt', async () => {
    await expectStatus(
      '////%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2ftest-file.txt'
    )
  })

  it('should prevent traversing with /\\\\\\%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/\\\\\\%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /\\\\\\%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/\\\\\\%2e%2e%5c%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /\\\\\\%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus('/\\\\\\%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt')
  })

  it('should prevent traversing with /\\\\\\%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/\\\\\\%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /\\\\\\%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/\\\\\\%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /\\\\\\%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/\\\\\\%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /\\\\\\%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/\\\\\\%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /\\\\\\%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt', async () => {
    await expectStatus(
      '/\\\\\\%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5c%2e%2e%5ctest-file.txt'
    )
  })

  it('should prevent traversing with /..//test-file.txt', async () => {
    await expectStatus('/..//test-file.txt')
  })

  it('should prevent traversing with /..//..//test-file.txt', async () => {
    await expectStatus('/..//..//test-file.txt')
  })

  it('should prevent traversing with /..//..//..//test-file.txt', async () => {
    await expectStatus('/..//..//..//test-file.txt')
  })

  it('should prevent traversing with /..//..//..//..//test-file.txt', async () => {
    await expectStatus('/..//..//..//..//test-file.txt')
  })

  it('should prevent traversing with /..//..//..//..//..//test-file.txt', async () => {
    await expectStatus('/..//..//..//..//..//test-file.txt')
  })

  it('should prevent traversing with /..//..//..//..//..//..//test-file.txt', async () => {
    await expectStatus('/..//..//..//..//..//..//test-file.txt')
  })

  it('should prevent traversing with /..//..//..//..//..//..//..//test-file.txt', async () => {
    await expectStatus('/..//..//..//..//..//..//..//test-file.txt')
  })

  it('should prevent traversing with /..//..//..//..//..//..//..//..//test-file.txt', async () => {
    await expectStatus('/..//..//..//..//..//..//..//..//test-file.txt')
  })

  it('should prevent traversing with /..///test-file.txt', async () => {
    await expectStatus('/..///test-file.txt')
  })

  it('should prevent traversing with /..///..///test-file.txt', async () => {
    await expectStatus('/..///..///test-file.txt')
  })

  it('should prevent traversing with /..///..///..///test-file.txt', async () => {
    await expectStatus('/..///..///..///test-file.txt')
  })

  it('should prevent traversing with /..///..///..///..///test-file.txt', async () => {
    await expectStatus('/..///..///..///..///test-file.txt')
  })

  it('should prevent traversing with /..///..///..///..///..///test-file.txt', async () => {
    await expectStatus('/..///..///..///..///..///test-file.txt')
  })

  it('should prevent traversing with /..///..///..///..///..///..///test-file.txt', async () => {
    await expectStatus('/..///..///..///..///..///..///test-file.txt')
  })

  it('should prevent traversing with /..///..///..///..///..///..///..///test-file.txt', async () => {
    await expectStatus('/..///..///..///..///..///..///..///test-file.txt')
  })

  it('should prevent traversing with /..///..///..///..///..///..///..///..///test-file.txt', async () => {
    await expectStatus('/..///..///..///..///..///..///..///..///test-file.txt')
  })

  it('should prevent traversing with /..\\\\test-file.txt', async () => {
    await expectStatus('/..\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\\\..\\\\test-file.txt', async () => {
    await expectStatus('/..\\\\..\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\\\..\\\\..\\\\test-file.txt', async () => {
    await expectStatus('/..\\\\..\\\\..\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\\\..\\\\..\\\\..\\\\test-file.txt', async () => {
    await expectStatus('/..\\\\..\\\\..\\\\..\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\\\..\\\\..\\\\..\\\\..\\\\test-file.txt', async () => {
    await expectStatus('/..\\\\..\\\\..\\\\..\\\\..\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\\\..\\\\..\\\\..\\\\..\\\\..\\\\test-file.txt', async () => {
    await expectStatus('/..\\\\..\\\\..\\\\..\\\\..\\\\..\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\\\..\\\\..\\\\..\\\\..\\\\..\\\\..\\\\test-file.txt', async () => {
    await expectStatus(
      '/..\\\\..\\\\..\\\\..\\\\..\\\\..\\\\..\\\\test-file.txt'
    )
  })

  it('should prevent traversing with /..\\\\..\\\\..\\\\..\\\\..\\\\..\\\\..\\\\..\\\\test-file.txt', async () => {
    await expectStatus(
      '/..\\\\..\\\\..\\\\..\\\\..\\\\..\\\\..\\\\..\\\\test-file.txt'
    )
  })

  it('should prevent traversing with /..\\\\\\test-file.txt', async () => {
    await expectStatus('/..\\\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\\\\\..\\\\\\test-file.txt', async () => {
    await expectStatus('/..\\\\\\..\\\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\\\\\..\\\\\\..\\\\\\test-file.txt', async () => {
    await expectStatus('/..\\\\\\..\\\\\\..\\\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\\\\\..\\\\\\..\\\\\\..\\\\\\test-file.txt', async () => {
    await expectStatus('/..\\\\\\..\\\\\\..\\\\\\..\\\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\test-file.txt', async () => {
    await expectStatus('/..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\test-file.txt', async () => {
    await expectStatus(
      '/..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\test-file.txt'
    )
  })

  it('should prevent traversing with /..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\test-file.txt', async () => {
    await expectStatus(
      '/..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\test-file.txt'
    )
  })

  it('should prevent traversing with /..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\test-file.txt', async () => {
    await expectStatus(
      '/..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\..\\\\\\test-file.txt'
    )
  })

  it('should prevent traversing with /./\\/./test-file.txt', async () => {
    await expectStatus('/./\\/./test-file.txt')
  })

  it('should prevent traversing with /./\\/././\\/./test-file.txt', async () => {
    await expectStatus('/./\\/././\\/./test-file.txt')
  })

  it('should prevent traversing with /./\\/././\\/././\\/./test-file.txt', async () => {
    await expectStatus('/./\\/././\\/././\\/./test-file.txt')
  })

  it('should prevent traversing with /./\\/././\\/././\\/././\\/./test-file.txt', async () => {
    await expectStatus('/./\\/././\\/././\\/././\\/./test-file.txt')
  })

  it('should prevent traversing with /./\\/././\\/././\\/././\\/././\\/./test-file.txt', async () => {
    await expectStatus('/./\\/././\\/././\\/././\\/././\\/./test-file.txt')
  })

  it('should prevent traversing with /./\\/././\\/././\\/././\\/././\\/././\\/./test-file.txt', async () => {
    await expectStatus(
      '/./\\/././\\/././\\/././\\/././\\/././\\/./test-file.txt'
    )
  })

  it('should prevent traversing with /./\\/././\\/././\\/././\\/././\\/././\\/././\\/./test-file.txt', async () => {
    await expectStatus(
      '/./\\/././\\/././\\/././\\/././\\/././\\/././\\/./test-file.txt'
    )
  })

  it('should prevent traversing with /./\\/././\\/././\\/././\\/././\\/././\\/././\\/././\\/./test-file.txt', async () => {
    await expectStatus(
      '/./\\/././\\/././\\/././\\/././\\/././\\/././\\/././\\/./test-file.txt'
    )
  })

  it('should prevent traversing with /.\\/\\.\\test-file.txt', async () => {
    await expectStatus('/.\\/\\.\\test-file.txt')
  })

  it('should prevent traversing with /.\\/\\.\\.\\/\\.\\test-file.txt', async () => {
    await expectStatus('/.\\/\\.\\.\\/\\.\\test-file.txt')
  })

  it('should prevent traversing with /.\\/\\.\\.\\/\\.\\.\\/\\.\\test-file.txt', async () => {
    await expectStatus('/.\\/\\.\\.\\/\\.\\.\\/\\.\\test-file.txt')
  })

  it('should prevent traversing with /.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\test-file.txt', async () => {
    await expectStatus('/.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\test-file.txt')
  })

  it('should prevent traversing with /.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\test-file.txt', async () => {
    await expectStatus(
      '/.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\test-file.txt', async () => {
    await expectStatus(
      '/.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\test-file.txt', async () => {
    await expectStatus(
      '/.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\test-file.txt', async () => {
    await expectStatus(
      '/.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\.\\/\\.\\test-file.txt'
    )
  })

  it('should prevent traversing with /././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../test-file.txt', async () => {
    await expectStatus(
      '/././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../test-file.txt'
    )
  })

  it('should prevent traversing with /././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../test-file.txt', async () => {
    await expectStatus(
      '/././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../test-file.txt'
    )
  })

  it('should prevent traversing with /././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../../test-file.txt', async () => {
    await expectStatus(
      '/././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../../test-file.txt'
    )
  })

  it('should prevent traversing with /././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../../../test-file.txt', async () => {
    await expectStatus(
      '/././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../../../../test-file.txt', async () => {
    await expectStatus(
      '/././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../../../../../test-file.txt', async () => {
    await expectStatus(
      '/././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../../../../../../test-file.txt', async () => {
    await expectStatus(
      '/././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../../../../../../../test-file.txt', async () => {
    await expectStatus(
      '/././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././././../../../../../../../../test-file.txt'
    )
  })

  it('should prevent traversing with /.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\test-file.txt', async () => {
    await expectStatus(
      '/.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\..\\..\\..\\..\\..\\..\\test-file.txt', async () => {
    await expectStatus(
      '/.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\..\\..\\..\\..\\..\\..\\..\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /./../test-file.txt', async () => {
    await expectStatus('/./../test-file.txt')
  })

  it('should prevent traversing with /./.././../test-file.txt', async () => {
    await expectStatus('/./.././../test-file.txt')
  })

  it('should prevent traversing with /./.././.././../test-file.txt', async () => {
    await expectStatus('/./.././.././../test-file.txt')
  })

  it('should prevent traversing with /./.././.././.././../test-file.txt', async () => {
    await expectStatus('/./.././.././.././../test-file.txt')
  })

  it('should prevent traversing with /./.././.././.././.././../test-file.txt', async () => {
    await expectStatus('/./.././.././.././.././../test-file.txt')
  })

  it('should prevent traversing with /./.././.././.././.././.././../test-file.txt', async () => {
    await expectStatus('/./.././.././.././.././.././../test-file.txt')
  })

  it('should prevent traversing with /./.././.././.././.././.././.././../test-file.txt', async () => {
    await expectStatus('/./.././.././.././.././.././.././../test-file.txt')
  })

  it('should prevent traversing with /./.././.././.././.././.././.././.././../test-file.txt', async () => {
    await expectStatus('/./.././.././.././.././.././.././.././../test-file.txt')
  })

  it('should prevent traversing with /.\\..\\test-file.txt', async () => {
    await expectStatus('/.\\..\\test-file.txt')
  })

  it('should prevent traversing with /.\\..\\.\\..\\test-file.txt', async () => {
    await expectStatus('/.\\..\\.\\..\\test-file.txt')
  })

  it('should prevent traversing with /.\\..\\.\\..\\.\\..\\test-file.txt', async () => {
    await expectStatus('/.\\..\\.\\..\\.\\..\\test-file.txt')
  })

  it('should prevent traversing with /.\\..\\.\\..\\.\\..\\.\\..\\test-file.txt', async () => {
    await expectStatus('/.\\..\\.\\..\\.\\..\\.\\..\\test-file.txt')
  })

  it('should prevent traversing with /.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\test-file.txt', async () => {
    await expectStatus('/.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\test-file.txt')
  })

  it('should prevent traversing with /.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\test-file.txt', async () => {
    await expectStatus(
      '/.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\test-file.txt', async () => {
    await expectStatus(
      '/.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\test-file.txt', async () => {
    await expectStatus(
      '/.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\.\\..\\test-file.txt'
    )
  })

  it('should prevent traversing with /.//..//test-file.txt', async () => {
    await expectStatus('/.//..//test-file.txt')
  })

  it('should prevent traversing with /.//..//.//..//test-file.txt', async () => {
    await expectStatus('/.//..//.//..//test-file.txt')
  })

  it('should prevent traversing with /.//..//.//..//.//..//test-file.txt', async () => {
    await expectStatus('/.//..//.//..//.//..//test-file.txt')
  })

  it('should prevent traversing with /.//..//.//..//.//..//.//..//test-file.txt', async () => {
    await expectStatus('/.//..//.//..//.//..//.//..//test-file.txt')
  })

  it('should prevent traversing with /.//..//.//..//.//..//.//..//.//..//test-file.txt', async () => {
    await expectStatus('/.//..//.//..//.//..//.//..//.//..//test-file.txt')
  })

  it('should prevent traversing with /.//..//.//..//.//..//.//..//.//..//.//..//test-file.txt', async () => {
    await expectStatus(
      '/.//..//.//..//.//..//.//..//.//..//.//..//test-file.txt'
    )
  })

  it('should prevent traversing with /.//..//.//..//.//..//.//..//.//..//.//..//.//..//test-file.txt', async () => {
    await expectStatus(
      '/.//..//.//..//.//..//.//..//.//..//.//..//.//..//test-file.txt'
    )
  })

  it('should prevent traversing with /.//..//.//..//.//..//.//..//.//..//.//..//.//..//.//..//test-file.txt', async () => {
    await expectStatus(
      '/.//..//.//..//.//..//.//..//.//..//.//..//.//..//.//..//test-file.txt'
    )
  })

  it('should prevent traversing with /.\\\\..\\\\test-file.txt', async () => {
    await expectStatus('/.\\\\..\\\\test-file.txt')
  })

  it('should prevent traversing with /.\\\\..\\\\.\\\\..\\\\test-file.txt', async () => {
    await expectStatus('/.\\\\..\\\\.\\\\..\\\\test-file.txt')
  })

  it('should prevent traversing with /.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\test-file.txt', async () => {
    await expectStatus('/.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\test-file.txt')
  })

  it('should prevent traversing with /.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\test-file.txt', async () => {
    await expectStatus(
      '/.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\test-file.txt', async () => {
    await expectStatus(
      '/.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\test-file.txt', async () => {
    await expectStatus(
      '/.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\test-file.txt', async () => {
    await expectStatus(
      '/.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\test-file.txt'
    )
  })

  it('should prevent traversing with /.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\test-file.txt', async () => {
    await expectStatus(
      '/.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\.\\\\..\\\\test-file.txt'
    )
  })

  it('should prevent traversing with /../test-file.txt', async () => {
    await expectStatus('/../test-file.txt')
  })

  it('should prevent traversing with /../..//test-file.txt', async () => {
    await expectStatus('/../..//test-file.txt')
  })

  it('should prevent traversing with /../..//../test-file.txt', async () => {
    await expectStatus('/../..//../test-file.txt')
  })

  it('should prevent traversing with /../..//../..//test-file.txt', async () => {
    await expectStatus('/../..//../..//test-file.txt')
  })

  it('should prevent traversing with /../..//../..//../test-file.txt', async () => {
    await expectStatus('/../..//../..//../test-file.txt')
  })

  it('should prevent traversing with /../..//../..//../..//test-file.txt', async () => {
    await expectStatus('/../..//../..//../..//test-file.txt')
  })

  it('should prevent traversing with /../..//../..//../..//../test-file.txt', async () => {
    await expectStatus('/../..//../..//../..//../test-file.txt')
  })

  it('should prevent traversing with /../..//../..//../..//../..//test-file.txt', async () => {
    await expectStatus('/../..//../..//../..//../..//test-file.txt')
  })

  it('should prevent traversing with /..\\test-file.txt', async () => {
    await expectStatus('/..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\..\\..\\\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\..\\..\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\..\\..\\\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\..\\..\\\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\..\\..\\\\..\\..\\\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\..\\..\\\\..\\..\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\..\\..\\\\..\\..\\\\..\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\..\\..\\\\..\\..\\\\..\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\..\\..\\\\..\\..\\\\..\\..\\\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\..\\..\\\\..\\..\\\\..\\..\\\\test-file.txt')
  })

  it('should prevent traversing with /..///test-file.txt', async () => {
    await expectStatus('/..///test-file.txt')
  })

  it('should prevent traversing with /../..///test-file.txt', async () => {
    await expectStatus('/../..///test-file.txt')
  })

  it('should prevent traversing with /../..//..///test-file.txt', async () => {
    await expectStatus('/../..//..///test-file.txt')
  })

  it('should prevent traversing with /../..//../..///test-file.txt', async () => {
    await expectStatus('/../..//../..///test-file.txt')
  })

  it('should prevent traversing with /../..//../..//..///test-file.txt', async () => {
    await expectStatus('/../..//../..//..///test-file.txt')
  })

  it('should prevent traversing with /../..//../..//../..///test-file.txt', async () => {
    await expectStatus('/../..//../..//../..///test-file.txt')
  })

  it('should prevent traversing with /../..//../..//../..//..///test-file.txt', async () => {
    await expectStatus('/../..//../..//../..//..///test-file.txt')
  })

  it('should prevent traversing with /../..//../..//../..//../..///test-file.txt', async () => {
    await expectStatus('/../..//../..//../..//../..///test-file.txt')
  })

  it('should prevent traversing with /..\\\\\\test-file.txt', async () => {
    await expectStatus('/..\\\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\..\\\\\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\..\\\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\..\\..\\\\\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\..\\..\\\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\..\\..\\\\..\\\\\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\..\\..\\\\..\\\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\..\\..\\\\..\\..\\\\\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\..\\..\\\\..\\..\\\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\..\\..\\\\..\\..\\\\..\\\\\\test-file.txt', async () => {
    await expectStatus('/..\\..\\\\..\\..\\\\..\\..\\\\..\\\\\\test-file.txt')
  })

  it('should prevent traversing with /..\\..\\\\..\\..\\\\..\\..\\\\..\\..\\\\\\test-file.txt', async () => {
    await expectStatus(
      '/..\\..\\\\..\\..\\\\..\\..\\\\..\\..\\\\\\test-file.txt'
    )
  })

  it('should prevent traversing with /\\..%2f', async () => {
    await expectStatus('/\\..%2f')
  })

  it('should prevent traversing with /\\..%2f\\..%2f', async () => {
    await expectStatus('/\\..%2f\\..%2f')
  })

  it('should prevent traversing with /\\..%2f\\..%2f\\..%2f', async () => {
    await expectStatus('/\\..%2f\\..%2f\\..%2f')
  })

  it('should prevent traversing with /\\..%2f\\..%2f\\..%2f\\..%2f', async () => {
    await expectStatus('/\\..%2f\\..%2f\\..%2f\\..%2f')
  })

  it('should prevent traversing with /\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f', async () => {
    await expectStatus('/\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f')
  })

  it('should prevent traversing with /\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f', async () => {
    await expectStatus('/\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f')
  })

  it('should prevent traversing with /\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f', async () => {
    await expectStatus('/\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f')
  })

  it('should prevent traversing with /\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f\\..%2ftest-file.txt', async () => {
    await expectStatus(
      '/\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f\\..%2f\\..%2ftest-file.txt'
    )
  })
})
