# ESLint Version Conflict Fixture

This fixture tests the upgrade scenario where:
- `eslint-config-next` is being upgraded to a version that requires ESLint >= 9.0.0
- The project has ESLint 8.x installed

## Expected Behavior

When running `npx @next/codemod upgrade latest`:

1. The codemod should detect the peer dependency conflict between `eslint-config-next` and the installed `eslint` version
2. It should prompt the user: "Would you like to upgrade ESLint to a compatible version?"
3. If the user says yes:
   - ESLint should be upgraded to the latest version matching the peer dependency requirement
   - The installation should succeed
4. If the user says no:
   - The user should see clear instructions on how to resolve the conflict manually
   - If installation fails, actionable error messages should be displayed

## Testing

```bash
pnpm test:upgrade-fixture bin/__testfixtures__/eslint-version-conflict latest
```
