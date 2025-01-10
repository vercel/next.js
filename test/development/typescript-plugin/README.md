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
