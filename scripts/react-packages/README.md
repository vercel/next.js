# Result experiment React packages

This archive contains the inputs to Next's `copy_vendor_react` task. It keeps
the Result experiment reproducible before its React packages are published to
npm. The `react-result-build` development dependency and lockfile pin the archive;
`check-precompiled` continues to regenerate and compare the vendored output.

The packages come from the successful React CI build of
[`cdec04a526f093403ad638cde2588f0021ac4f41`](https://github.com/react/react/commit/cdec04a526f093403ad638cde2588f0021ac4f41):

- [Workflow run 38590479375](https://github.com/react/react/actions/runs/38590479375)
- [Artifact 11906743991, `artifacts_combined`](https://github.com/react/react/actions/runs/38590479375/artifacts/11906743991)
- Artifact ZIP SHA-256: `4d1432acfa57578999d01a7f982301e34e47b0a5fc8c1a66b5ee545eee818882`
- Contained `build.tgz` SHA-256: `f7fcfd46eb5008425e01d1dac3455e52b26909769b9469423dfe1099080f85c8`

The artifact's `build/COMMIT_SHA` matches the full commit above. The archive was
produced with `npm pack --ignore-scripts` from a wrapper package containing the
`react`, `react-dom`, `scheduler`, and both Flight bundler packages from
`build/oss-stable` and `build/oss-experimental`, plus stable `react-is`. Every
contained React file matches the CI artifact byte for byte; no source was rebuilt
or version string rewritten. The two channels retain their distinct CI builds
and versions. The wrapper has no dependencies: these are vendoring inputs, so
installing them does not try to resolve their unpublished peer versions on npm.
The archive's integrity hash is recorded in `pnpm-lock.yaml`.

After installing dependencies, regenerate the vendored files with:

```sh
pnpm --filter=next exec taskr copy_vendor_react
```

Return `copy_vendor_react` to the published package dependencies and remove
this archive when the experiment can use a published React revision.
