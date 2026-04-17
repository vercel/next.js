# typescript-external-dir: CONVERSION-BUG

## Summary

The test failure is caused by incorrect file path mapping in the converted test setup. The test uses `subDir: 'project'` and maps `'../shared/components'` to the shared components, but the actual import in `pages/index.tsx` expects `../../shared/components/counter`. This creates a mismatch between where the files are placed in the temporary test directory and where the Next.js application expects to find them.

## Evidence

- The error shows: `Module not found: Can't resolve '../../shared/components/counter'`
- In the converted test setup, the shared components are mapped to `'../shared/components'` (one level up from project)
- But the import in `pages/index.tsx` uses `'../../shared/components/counter'` (two levels up from project)
- The `next.config.js` has `experimental: { externalDir: true }` enabled, which should allow external directory imports
- All fixture files exist in both the original and converted test directories
- The original integration test works by running from the `project` directory where `../../shared` correctly resolves to the shared directory

## Fix suggestion

The file mapping in the test setup needs to be corrected. Change the mapping from:

```js
'../shared/components': new FileRef(join(__dirname, 'shared/components')),
'../shared/libs': new FileRef(join(__dirname, 'shared/libs')),
'../shared/tsconfig.json': new FileRef(join(__dirname, 'shared/tsconfig.json')),
```

To:

```js
'../../shared/components': new FileRef(join(__dirname, 'shared/components')),
'../../shared/libs': new FileRef(join(__dirname, 'shared/libs')),
'../../shared/tsconfig.json': new FileRef(join(__dirname, 'shared/tsconfig.json')),
```

This will ensure the shared files are placed at the correct relative path that matches the import statements in the source code.
