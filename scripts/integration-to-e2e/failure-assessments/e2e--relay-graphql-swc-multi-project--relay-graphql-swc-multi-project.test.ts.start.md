# relay-graphql-swc-multi-project: CONVERSION-BUG

## Summary

The test failure is caused by incorrect conversion from the original integration test to e2e format. The converted test uses `nextTestSetup` with pnpm workspace commands (`pnpm --dir project-a exec next build`) but the `project-a` and `project-b` directories lack the required `package.json` files. The original test used `nextBuild()` directly on each project directory, which worked without requiring pnpm workspace setup.

## Evidence

1. **Error message**: `ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE No package found in this workspace` clearly indicates missing package.json files
2. **Missing package.json files**: Glob search confirms no package.json files exist in the project subdirectories
3. **Original vs converted approach**:
   - Original: `nextBuild(projectAAppDir, [], { cwd: projectAAppDir })` - direct build
   - Converted: `buildCommand: 'pnpm --dir project-a exec next build'` - requires pnpm workspace
4. **Test structure**: The test has two separate Next.js projects (project-a, project-b) with their own `next.config.js`, `pages/` directories, etc., but these were never meant to be pnpm workspace packages

## Fix suggestion

The test conversion incorrectly assumed `nextTestSetup` could handle multiple separate Next.js projects with pnpm workspace commands. The fix options are:

1. **Add package.json files** to `project-a` and `project-b` directories with appropriate dependencies and scripts
2. **Change build/start commands** to use direct `next` CLI instead of pnpm workspace commands (e.g., `buildCommand: 'cd project-a && npx next build'`)
3. **Restructure the test** to avoid using `nextTestSetup` for multiple projects and instead use the lower-level Next.js test utilities like the original integration test did

The most straightforward fix would be option 1: adding proper package.json files to make the pnpm workspace commands work as intended.
