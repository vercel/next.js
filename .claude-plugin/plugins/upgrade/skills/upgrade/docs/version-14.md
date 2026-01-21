# Upgrading from Next.js 13 to 14

## Quick Reference

**Requirements**:
- Node.js 18.17+ (was 16.14+)
- React 18+

**Run upgrade command**:
```bash
npx @next/codemod@canary upgrade 14
```

## Official Documentation

For complete breaking changes and migration guide:
**[Next.js 14 Upgrade Guide](https://nextjs.org/docs/app/building-your-application/upgrading/version-14)**

## Key Breaking Changes

1. **Node.js minimum version**: 18.17+ required
2. **`next export` removed**: Use `output: 'export'` in config
3. **`@next/font` removed**: Use built-in `next/font`
4. **`ImageResponse` moved**: From `next/server` to `next/og`

## Detailed Examples

For comprehensive migration examples and troubleshooting:
**[v14 Migration Examples](https://nextjs.org/docs/app/guides/upgrading/upgrade-examples-14)**

## After Upgrade

Check for manual fixes needed:
```bash
grep -rn "@next-codemod-error" --include="*.ts" --include="*.tsx" .
```