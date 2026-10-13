export function warnMissingReactDependencies(projectDir: string) {
  // Resolve from the app so downloaded or linked CLI installations do not
  // warn about dependencies that are already installed in the target project.
  for (const dependency of ['react', 'react-dom']) {
    try {
      require.resolve(dependency, { paths: [projectDir] })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
        throw err
      }

      console.warn(
        `The module '${dependency}' was not found. Next.js requires that you include it in 'dependencies' of your 'package.json'. To add it, run 'npm install ${dependency}'`
      )
    }
  }
}
