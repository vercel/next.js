import { DefaultRouteMatcherManager } from './default-route-matcher-manager'

describe('DefaultRouteMatcherManager', () => {
  it('will throw an error when used before it has been reloaded', async () => {
    const manager = new DefaultRouteMatcherManager()
    await expect(manager.match('/some/not/real/path')).resolves.toEqual(null)
    manager.push({ matchers: jest.fn(async () => []) })
    await expect(manager.match('/some/not/real/path')).rejects.toThrow()
    await manager.reload()
    await expect(manager.match('/some/not/real/path')).resolves.toEqual(null)
  })

  it('will not error and not match when no matchers are provided', async () => {
    const matchers = new DefaultRouteMatcherManager()
    await matchers.reload()
    await expect(matchers.match('/some/not/real/path')).resolves.toEqual(null)
  })
})

// TODO: port tests
/* eslint-disable jest/no-commented-out-tests */

// describe('DefaultRouteMatcherManager', () => {
//     describe('static routes', () => {
//       it.each([
//         ['/some/static/route', '<root>/some/static/route.js'],
//         ['/some/other/static/route', '<root>/some/other/static/route.js'],
//       ])('will match %s to %s', async (pathname, filename) => {
//         const matchers = new DefaultRouteMatcherManager()

//         matchers.push({
//           routes: async () => [
//             {
//               kind: RouteKind.APP_ROUTE,
//               pathname: '/some/other/static/route',
//               filename: '<root>/some/other/static/route.js',
//               bundlePath: '<bundle path>',
//               page: '<page>',
//             },
//             {
//               kind: RouteKind.APP_ROUTE,
//               pathname: '/some/static/route',
//               filename: '<root>/some/static/route.js',
//               bundlePath: '<bundle path>',
//               page: '<page>',
//             },
//           ],
//         })

//         await matchers.compile()

//         expect(await matchers.match(pathname)).toEqual({
//           kind: RouteKind.APP_ROUTE,
//           pathname,
//           filename,
//           bundlePath: '<bundle path>',
//           page: '<page>',
//         })
//       })
//     })

//     describe('async generator', () => {
//       it('will match', async () => {
//         const matchers = new DefaultRouteMatcherManager()

//         matchers.push({
//           routes: async () => [
//             {
//               kind: RouteKind.APP_ROUTE,
//               pathname: '/account/[[...slug]]',
//               filename: '<root>/account/[[...slug]].js',
//               bundlePath: '<bundle path>',
//               page: '<page>',
//             },
//             {
//               kind: RouteKind.APP_ROUTE,
//               pathname: '/blog/[[...slug]]',
//               filename: '<root>/blog/[[...slug]].js',
//               bundlePath: '<bundle path>',
//               page: '<page>',
//             },
//             {
//               kind: RouteKind.APP_ROUTE,
//               pathname: '/[[...optional]]',
//               filename: '<root>/[[...optional]].js',
//               bundlePath: '<bundle path>',
//               page: '<page>',
//             },
//           ],
//         })

//         await matchers.compile()

//         const matches: string[] = []

//         for await (const match of matchers.each('/blog/some-other-path')) {
//           matches.push(match.definition.filename)
//         }

//         expect(matches).toHaveLength(2)
//         expect(matches[0]).toEqual('<root>/blog/[[...slug]].js')
//         expect(matches[1]).toEqual('<root>/[[...optional]].js')
//       })
//     })

//     describe('dynamic routes', () => {
//       it.each([
//         {
//           pathname: '/users/123',
//           route: {
//             pathname: '/users/[id]',
//             filename: '<root>/users/[id].js',
//             params: { id: '123' },
//           },
//         },
//         {
//           pathname: '/account/123',
//           route: {
//             pathname: '/[...paths]',
//             filename: '<root>/[...paths].js',
//             params: { paths: ['account', '123'] },
//           },
//         },
//         {
//           pathname: '/dashboard/users/123',
//           route: {
//             pathname: '/[...paths]',
//             filename: '<root>/[...paths].js',
//             params: { paths: ['dashboard', 'users', '123'] },
//           },
//         },
//       ])(
//         "will match '$pathname' to '$route.filename'",
//         async ({ pathname, route }) => {
//           const matchers = new DefaultRouteMatcherManager()

//           matchers.push({
//             routes: async () => [
//               {
//                 kind: RouteKind.APP_ROUTE,
//                 pathname: '/[...paths]',
//                 filename: '<root>/[...paths].js',
//                 bundlePath: '<bundle path>',
//                 page: '<page>',
//               },
//               {
//                 kind: RouteKind.APP_ROUTE,
//                 pathname: '/users/[id]',
//                 filename: '<root>/users/[id].js',
//                 bundlePath: '<bundle path>',
//                 page: '<page>',
//               },
//             ],
//           })

//           await matchers.compile()

//           expect(await matchers.match(pathname)).toEqual({
//             kind: RouteKind.APP_ROUTE,
//             bundlePath: '<bundle path>',
//             page: '<page>',
//             ...route,
//           })
//         }
//       )
//     })
//   })
