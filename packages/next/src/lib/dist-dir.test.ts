import { resolve } from 'path'
import {
  DistDirOutsideWorkspaceError,
  verifyDistDirIsInsideWorkspace,
} from './dist-dir'

describe('verifyDistDirIsInsideWorkspace', () => {
  // An app at <repo>/apps/web, inside a monorepo rooted at <repo>.
  const appDir = '/repo/apps/web'
  const workspaceRoot = '/repo'
  const verify = (distDir: string) =>
    verifyDistDirIsInsideWorkspace(
      resolve(appDir, distDir),
      appDir,
      workspaceRoot
    )

  it.each([
    '.next', // inside the app
    '.next/dev',
    '..next', // name starts with two dots, but is still inside the app
    '.cache',
    '../.next', // beside the app, still in the workspace
    '../../.next', // at the workspace root, as Nx monorepos use
    '../../..cache', // name starts with two dots, but is inside the workspace
  ])('allows %s', (distDir) => {
    expect(() => verify(distDir)).not.toThrow()
  })

  it.each([
    '.', // the app itself
    '..', // an intermediate directory containing the app
    '../..', // the workspace root, also containing the app
    '../../..', // above the workspace
    '/tmp/elsewhere',
  ])('rejects %s', (distDir) => {
    expect(() => verify(distDir)).toThrow(DistDirOutsideWorkspaceError)
  })

  it.each(['.next', '..next'])(
    'allows an in-app %s distDir when the inferred workspace root is unrelated',
    (distDir) => {
      expect(() =>
        verifyDistDirIsInsideWorkspace(
          `${appDir}/${distDir}`,
          appDir,
          '/custom/root'
        )
      ).not.toThrow()
    }
  )

  it('includes each resolved boundary in its error', () => {
    expect(() =>
      verifyDistDirIsInsideWorkspace('/repo/apps', appDir, workspaceRoot)
    ).toThrowErrorMatchingInlineSnapshot(`
     "The configured distDir should be inside of the application directory or the workspace containing it, and must not contain the application directory itself:

       distDir:        /repo/apps
       application:    /repo/apps/web
       workspace root: /repo

     Read more: https://nextjs.org/docs/messages/invalid-dist-dir"
    `)
  })
})
