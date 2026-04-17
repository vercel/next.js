# relay-graphql-swc-multi-project: CONVERSION-BUG

## Summary

The test conversion incorrectly assumes a pnpm workspace setup that requires `package.json` files in each project subdirectory. The original integration test uses `launchApp()` to directly launch Next.js apps in the `project-a` and `project-b` directories, which doesn't require individual package.json files. However, the converted test tries to use pnpm workspace commands (`pnpm --dir project-a exec next dev`) which fail because the subdirectories lack package.json files.

## Evidence

1. **Error message**: `ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE No package found in this workspace` when running `pnpm --dir project-b exec next dev --turbopack`

2. **Missing files**: Both the original and converted test directories lack `package.json` files in the `project-a` and `project-b` subdirectories

3. **Different approaches**:
   - Original test uses `launchApp(projectBAppDir, appPort, { cwd: projectBAppDir })` which works without individual package.json files
   - Converted test uses `buildCommand: 'pnpm --dir project-b exec next build'` and `startCommand: 'pnpm --dir project-b exec next dev --turbopack'` which require package.json files

## Fix suggestion

The converted test needs to be restructured to work without pnpm workspace commands. Options include:

1. **Create package.json files** for each project subdirectory with appropriate Next.js dependencies
2. **Use a different test setup approach** that doesn't rely on pnpm workspace commands, possibly using the `nextTestSetup` with proper directory configuration that matches the original `launchApp()` behavior
3. **Modify the buildCommand and startCommand** to use direct Next.js CLI calls instead of pnpm workspace commands

The most straightforward fix would be adding minimal `package.json` files to both `project-a` and `project-b` directories with Next.js and relay-runtime as dependencies.
