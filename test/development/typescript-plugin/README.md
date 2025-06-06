# typescript-plugin fixture

This fixture is used to test the TypeScript plugin.
The plugin only applies to VSCode so manual testing in VSCode is required.

## Getting started

1. Install the dependencies with `pnpm install`
2. Open any TypeScript file of this fixture in VSCode
3. Change TypeScript version to use Workspace version (see https://nextjs.org/docs/app/api-reference/config/typescript#typescript-plugin)

## Tests

### Client component prop serialization

`app/client.tsx#ClientComponent` has props that can and can't be serialized.
Ensure the current comments still describe the observed behavior.

`app/error.tsx#Error` and `app/global-error.tsx#GlobalError` have a `reset` prop
that should be excluded from the serialization check.

### Client Boundary

- `client-boundary/app/non-serializable-action-props.tsx` has examples of Server Action props that can't be serialized, which is allowed.
- `client-boundary/app/non-serializable-props.tsx` has examples of props that can't be serialized.
- `client-boundary/app/serializable-props.tsx` has examples of props that can be serialized.

### Metadata

- `metadata/app/metadata/completion` has examples of metadata and generateMetadata completions.
- `metadata/app/metadata/missing-type-warning` has examples of metadata and generateMetadata missing type warnings.
- `metadata/app/metadata/client` has examples of metadata and generateMetadata not allowed in a client component.
