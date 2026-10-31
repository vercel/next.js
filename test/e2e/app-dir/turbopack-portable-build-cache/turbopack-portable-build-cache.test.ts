import { FileRef, nextTestSetup } from 'e2e-utils'
import fs from 'fs/promises'
import path from 'path'
import {
  executedFunctionNames,
  readTaskExecutions,
  type TaskExecution,
} from './turbo-tasks-trace'

// Always install with pnpm's hoisted linker, so the package layout (and with it
// which symlinks are resolved) doesn't depend on the Node.js version. This is
// the layout the Node.js realpath workaround (`getPnpmRealpathWorkaround`)
// uses on affected versions anyway.
const hoistedInstall = { 'pnpm-workspace.yaml': 'nodeLinker: hoisted\n' }

// The names of the functions that executed, with all `NextConfig` getters
// collapsed into a single `NextConfig::*` entry. They all depend on the same
// config cell and re-execute together. Which getters are read also depends on
// the build mode (e.g. Cache Components), which would make the snapshots
// mode-dependent.
function functionNames(executions: TaskExecution[]): string[] {
  return [
    ...new Set(
      executedFunctionNames(executions).map((name) =>
        name.startsWith('NextConfig::') ? 'NextConfig::*' : name
      )
    ),
  ].sort()
}

// The Turbopack filesystem cache for `next build` should be portable: moving
// the project to another directory must not invalidate it.
//
// Every build runs with `NEXT_TURBOPACK_TRACING=turbo-tasks`, which records a
// span for every turbo-tasks function execution. A function that executes in a
// warm build was not served from the cache. The snapshots list the functions
// that execute in a warm build:
//   - in the same directory (baseline), and
//   - after moving the project, including its `.next` cache, to another
//     directory.
//
// The cache is not fully portable yet, so the "moved" snapshot documents the
// functions that are currently re-executed. When the snapshots move:
//   - FEWER entries → that's a win. Run with `-u` and commit the new snapshot.
//   - MORE entries → something regressed. Investigate before updating.
//
// TODO(deploy-test-completion): This suite inspects local build artifacts and
// moves the local fixture, which deploy tests do not support.
// @force-gate !deploy
// @force-gate turbopack
// @force-gate start
describe('turbopack-portable-build-cache', () => {
  describe('minimal app', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/minimal'),
      overrideFiles: hoistedInstall,
      skipStart: true,
    })

    it('reuses the build cache after moving the project', async () => {
      const coldExecutions = (await tracedBuild(next)).executions
      // Sanity check that the trace contains task executions at all, so empty
      // snapshots below mean "fully cached", not "nothing was traced".
      expect(coldExecutions.length).toBeGreaterThan(10_000)

      const sameDirExecutions = (await tracedBuild(next)).executions
      expect(functionNames(sameDirExecutions)).toMatchInlineSnapshot(`
       [
         "<DiskFileSystem as FileSystem>::raw_read_dir",
         "<DiskFileSystem as FileSystem>::read",
         "ProjectContainer::project",
         "emit_all_output_assets_once_with_issues_operation",
         "get_all_written_entrypoints_with_issues_operation",
         "project_root_path_operation",
         "uppercase_env_map",
       ]
      `)

      await moveProject(next, next.testDir)
      const movedExecutions = (await tracedBuild(next)).executions
      expect(functionNames(movedExecutions)).toMatchInlineSnapshot(`
       [
         "<DiskFileSystem as FileSystem>::raw_read_dir",
         "<DiskFileSystem as FileSystem>::read",
         "<DiskFileSystem as FileSystem>::write",
         "<DiskFileSystem as turbo_tasks :: ValueToString>::to_string",
         "<NftJsonAsset as Asset>::content",
         "<ServerNftJsonAsset as Asset>::content",
         "DiskFileSystem::new_internal",
         "NextConfig::*",
         "ProjectContainer::project",
         "emit_all_output_assets_once_with_issues_operation",
         "get_all_written_entrypoints_with_issues_operation",
         "inner_entrypoints_without_collectibles_operation",
         "project_root_path_operation",
         "uppercase_env_map",
       ]
      `)
    }, 600_000)
  })

  // A monorepo combining the features that interact with the project location:
  //
  // <workspace root>/       the project root (`turbopack.root`), moved as a whole
  // ├── apps/web/           the Next.js app (`next.testDir`)
  // │   ├── app/            static, dynamic, route handler, server action,
  // │   │                   client component routes
  // │   ├── pages/          pages router page and API route
  // │   ├── proxy.js
  // │   ├── loaders/        webpack loader, applied via `turbopack.rules`
  // │   ├── lib/            `turbopack.resolveAlias` target
  // │   ├── jsconfig.json   `paths` alias into `packages/shared`
  // │   ├── linked → ../../packages/shared                  (relative symlink)
  // │   └── node_modules/@portable/ui → …/packages/ui       (workspace symlink)
  // └── packages/
  //     ├── shared/
  //     └── ui/             workspace package with a client component
  describe('monorepo with all features', () => {
    const fixture = path.join(__dirname, 'fixtures/monorepo')
    const { next } = nextTestSetup({
      files: {
        '.': new FileRef(path.join(fixture, 'apps/web')),
        '../../package.json': new FileRef(path.join(fixture, 'package.json')),
        '../../packages': new FileRef(path.join(fixture, 'packages')),
      },
      subDir: 'apps/web',
      overrideFiles: hoistedInstall,
      skipStart: true,
    })

    /** The isolated workspace root, two levels above the app. */
    const workspaceRoot = () => path.join(next.testDir, '..', '..')

    beforeAll(async () => {
      // The symlinks are created here with relative targets, so they still
      // resolve after the move.
      await fs.symlink(
        path.join('..', '..', 'packages', 'shared'),
        path.join(next.testDir, 'linked'),
        'dir'
      )
      const scope = path.join(next.testDir, 'node_modules', '@portable')
      await fs.mkdir(scope, { recursive: true })
      await fs.symlink(
        path.join('..', '..', '..', '..', 'packages', 'ui'),
        path.join(scope, 'ui'),
        'dir'
      )
    })

    afterAll(async () => {
      // The harness only removes `next.testDir` (the app), not the workspace
      // around it.
      if (!process.env.NEXT_TEST_SKIP_CLEANUP) {
        await fs.rm(workspaceRoot(), { recursive: true, force: true })
      }
    })

    /** Checks that every feature of the fixture is part of the build. */
    async function expectAllFeatures(cliOutput: string) {
      for (const route of [
        '/action',
        '/api/hello',
        '/blog/[slug]',
        '/blog/first',
        '/api/legacy',
        '/legacy',
        'Proxy',
      ]) {
        expect(cliOutput).toContain(route)
      }
      const html = await next.readFile('.next/server/app/index.html')
      for (const marker of [
        'loader-applied',
        'resolve-alias-applied',
        'jsconfig-paths-applied',
        'symlink-resolved',
        'workspace-package-resolved',
        'client component',
      ]) {
        expect(html).toContain(marker)
      }
      const serverActions = JSON.parse(
        await next.readFile('.next/server/server-reference-manifest.json')
      )
      expect(Object.keys(serverActions.node).length).toBeGreaterThan(0)
    }

    it('reuses the build cache after moving the project', async () => {
      const cold = await tracedBuild(next)
      await expectAllFeatures(cold.cliOutput)
      // Sanity check that the trace contains task executions at all, so empty
      // snapshots below mean "fully cached", not "nothing was traced".
      expect(cold.executions.length).toBeGreaterThan(10_000)

      const sameDir = await tracedBuild(next)
      expect(functionNames(sameDir.executions)).toMatchInlineSnapshot(`
       [
         "<DiskFileSystem as FileSystem>::raw_read_dir",
         "<DiskFileSystem as FileSystem>::read",
         "<DiskFileSystem as FileSystem>::read_link",
         "<EnvMap as ProcessEnv>::read_all",
         "ProjectContainer::project",
         "common_node_env",
         "create_evaluate_pool_assets_operation",
         "emit_all_output_assets_once_with_issues_operation",
         "get_all_written_entrypoints_with_issues_operation",
         "project_root_path_operation",
         "uppercase_env_map",
       ]
      `)

      await moveProject(next, workspaceRoot())
      const moved = await tracedBuild(next)
      await expectAllFeatures(moved.cliOutput)
      expect(functionNames(moved.executions)).toMatchInlineSnapshot(`
       [
         "<DiskFileSystem as FileSystem>::raw_read_dir",
         "<DiskFileSystem as FileSystem>::read",
         "<DiskFileSystem as FileSystem>::read_link",
         "<DiskFileSystem as FileSystem>::write",
         "<DiskFileSystem as turbo_tasks :: ValueToString>::to_string",
         "<EnvMap as ProcessEnv>::read_all",
         "<NftJsonAsset as Asset>::content",
         "<ServerNftJsonAsset as Asset>::content",
         "DiskFileSystem::new_internal",
         "NextConfig::*",
         "ProjectContainer::project",
         "common_node_env",
         "create_evaluate_pool_assets_operation",
         "emit_all_output_assets_once_with_issues_operation",
         "evaluate_webpack_loader",
         "get_all_written_entrypoints_with_issues_operation",
         "get_evaluate_pool",
         "inner_entrypoints_without_collectibles_operation",
         "project_root_path_operation",
         "uppercase_env_map",
       ]
      `)
    }, 600_000)
  })
})

const env = {
  NEXT_TURBOPACK_TRACING: 'turbo-tasks',
  // Persist even tiny snapshots so the test doesn't depend on the
  // minimum-compilation-time threshold.
  TURBO_ENGINE_IGNORE_DIRTY: '1',
  TURBO_ENGINE_SNAPSHOT_MIN_ACTIVE_TIME_MILLIS: '0',
  // Inside Docker, Next.js doesn't persist the server actions encryption key
  // in `.next/cache` and generates a new one for every build. The key is an
  // input of the Turbopack project, so that would make every build re-execute
  // server-action-dependent work, depending on the environment.
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:
    'cG9ydGFibGUtYnVpbGQtY2FjaGUtdGVzdC1rZXktMzI=',
  // Keep the build independent of the local telemetry setting (CI disables
  // it); build telemetry reads additional config values.
  NEXT_TELEMETRY_DISABLED: '1',
}

type Next = ReturnType<typeof nextTestSetup>['next']

async function tracedBuild(
  next: Next
): Promise<{ cliOutput: string; executions: TaskExecution[] }> {
  const { exitCode, cliOutput } = await next.build({ env })
  if (exitCode !== 0) {
    throw new Error(`next build exited with ${exitCode}:\n${cliOutput}`)
  }
  const executions = await readTaskExecutions(
    path.join(next.testDir, '.next-profiles', 'trace-turbopack.bin')
  )
  return { cliOutput, executions }
}

/**
 * Moves the project root (which contains `next.testDir`), including the `.next`
 * cache, to a new directory.
 */
async function moveProject(next: Next, projectRoot: string) {
  const movedRoot = `${projectRoot}-moved`
  const appDir = path.relative(projectRoot, next.testDir)
  await fs.rename(projectRoot, movedRoot)
  // The harness runs builds in and cleans up `next.testDir`.
  next.testDir = path.join(movedRoot, appDir)
}
