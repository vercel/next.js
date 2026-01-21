# Next.js Codemods Reference

## Automated Upgrade Command

Use the official Next.js codemod upgrade command:

```bash
npx @next/codemod@canary upgrade [revision]
```

**Revision options**: `latest`, `canary`, `rc`, or specific version (e.g., `16`)

This command:
1. Updates `package.json` dependencies
2. Runs all applicable codemods automatically
3. Leaves `@next-codemod-error` comments where manual fixes are needed

## Official Documentation

For the complete list of codemods and detailed usage instructions, see the official documentation:

**[Next.js Codemods Documentation](https://nextjs.org/docs/app/building-your-application/upgrading/codemods)**

This includes:
- All available codemods by version
- Before/after code examples
- Command-line options and flags
- Troubleshooting tips

## Finding Manual Fixes

After running the upgrade command, search for locations needing manual intervention:

```bash
grep -rn "@next-codemod-error" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" .
```