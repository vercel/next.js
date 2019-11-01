/* eslint-env jest */
import flattenRoutes from 'next/dist/lib/flatten-routes'

describe('flattenRoutes', () => {
  it('should not change already flat routes', async () => {
    const routes = [
      {
        source: '/',
        destination: '/another'
      },
      {
        source: '/a',
        destination: '/b',
        statusCode: 301
      }
    ]
    expect(flattenRoutes(routes)).toEqual(routes)
  })

  it('should flatten routes correctly', async () => {
    const routes = [
      {
        statusCode: 301,
        source: '/step-1',
        destination: '/step-2'
      },
      {
        source: '/step-2',
        destination: '/step-3'
      },
      {
        statusCode: 304,
        source: '/step-3',
        destination: '/step-4'
      },
      {
        source: '/first',
        destination: '/second'
      },
      {
        source: '/hello',
        destination: '/world'
      },
      {
        source: '/world',
        destination: '/complete'
      }
    ]

    expect(flattenRoutes(routes)).toEqual([
      {
        statusCode: 304,
        source: '/step-1',
        destination: '/step-4'
      },
      {
        statusCode: 304,
        source: '/step-2',
        destination: '/step-4'
      },
      {
        statusCode: 304,
        source: '/step-3',
        destination: '/step-4'
      },
      {
        source: '/first',
        destination: '/second'
      },
      {
        source: '/hello',
        destination: '/complete'
      },
      {
        source: '/world',
        destination: '/complete'
      }
    ])
  })

  it('should detect infinite redirect', async () => {
    const routes = [
      {
        source: '/a',
        destination: '/b'
      },
      {
        source: '/b',
        destination: '/a'
      }
    ]

    let errMsg = ''
    try {
      flattenRoutes(routes)
    } catch (err) {
      errMsg = err.message
    }
    expect(errMsg).toContain('Infinite redirect/rewrite detected for /a to /b')
  })
})
