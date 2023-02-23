import { BaseNextRequest, BaseNextResponse } from '../../base-http'
import { RouteKind } from '../route-kind'
import { RouteMatch } from '../route-matches/route-match'
import { RouteHandlerManager } from './route-handler-manager'

const req = {} as BaseNextRequest
const res = {} as BaseNextResponse

describe('RouteHandlerManager', () => {
  it('will return false when there are no handlers', async () => {
    const handlers = new RouteHandlerManager()
    expect(
      await handlers.handle(
        {
          definition: {
            kind: RouteKind.PAGES,
            filename: '<root>/index.js',
            pathname: '/',
            bundlePath: '<bundle path>',
            page: '<page>',
          },
        },
        req,
        res
      )
    ).toEqual(false)
  })

  it('will return false when there is no matching handler', async () => {
    const handlers = new RouteHandlerManager()
    const handler = { handle: jest.fn() }
    handlers.set(RouteKind.APP_PAGE, handler)

    expect(
      await handlers.handle(
        {
          definition: {
            kind: RouteKind.PAGES,
            filename: '<root>/index.js',
            pathname: '/',
            bundlePath: '<bundle path>',
            page: '<page>',
          },
        },
        req,
        res
      )
    ).toEqual(false)
    expect(handler.handle).not.toHaveBeenCalled()
  })

  it('will return true when there is a matching handler', async () => {
    const handlers = new RouteHandlerManager()
    const handler = { handle: jest.fn() }
    handlers.set(RouteKind.APP_PAGE, handler)

    const route: RouteMatch = {
      definition: {
        kind: RouteKind.APP_PAGE,
        filename: '<root>/index.js',
        pathname: '/',
        bundlePath: '<bundle path>',
        page: '<page>',
      },
    }

    expect(await handlers.handle(route, req, res)).toEqual(true)
    expect(handler.handle).toHaveBeenCalledWith(route, req, res)
  })

  it('will throw when multiple handlers are added for the same type', () => {
    const handlers = new RouteHandlerManager()
    const handler = { handle: jest.fn() }
    expect(() => handlers.set(RouteKind.APP_PAGE, handler)).not.toThrow()
    expect(() => handlers.set(RouteKind.APP_ROUTE, handler)).not.toThrow()
    expect(() => handlers.set(RouteKind.APP_PAGE, handler)).toThrow()
    expect(() => handlers.set(RouteKind.APP_ROUTE, handler)).toThrow()
  })

  it('will call the correct handler', async () => {
    const handlers = new RouteHandlerManager()
    const goodHandler = { handle: jest.fn() }
    const badHandler = { handle: jest.fn() }
    handlers.set(RouteKind.APP_PAGE, goodHandler)
    handlers.set(RouteKind.APP_ROUTE, badHandler)

    const route: RouteMatch = {
      definition: {
        kind: RouteKind.APP_PAGE,
        filename: '<root>/index.js',
        pathname: '/',
        bundlePath: '<bundle path>',
        page: '<page>',
      },
    }

    expect(await handlers.handle(route, req, res)).toEqual(true)
    expect(goodHandler.handle).toBeCalledWith(route, req, res)
    expect(badHandler.handle).not.toBeCalled()
  })
})
