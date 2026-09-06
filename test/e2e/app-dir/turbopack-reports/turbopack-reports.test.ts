import { nextTestSetup } from 'e2e-utils'

describe('turbopack-reports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // `bindings` is a direct dependency rather than one of `native-addon`. The
    // addon resolves it by walking up from the virtual store, and declaring it on
    // the addon would make it a non-registry transitive dependency, which
    // `blockExoticSubdeps` rejects.
    //
    // Both use `file:` rather than `link:` so pnpm copies them into the virtual
    // store. A linked package resolves to a path inside the app, which the bundler
    // treats as app code and tries to bundle, and `bindings` contains a `require`
    // it cannot resolve statically.
    dependencies: require('./package.json').dependencies,
  })

  it('should render page importing a package that loads a native binding', async () => {
    const $ = await next.render$('/native-addon-import-5913')
    expect($('#message').text()).toBe('Hello World')
    // Read off the compiled binary, so a module that resolved to nothing fails here.
    expect($('#context-aware').text()).toBe('true')
  })
})
