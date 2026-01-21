# Upgrading from Next.js 14 to 15

## Quick Reference

**Requirements**:
- Node.js 18.17+
- React 19+ (was React 18)
- TypeScript 5.0+

**Run upgrade command**:
```bash
npx @next/codemod@canary upgrade 15
```

## Official Documentation

For complete breaking changes and migration guide:
**[Next.js 15 Upgrade Guide](https://nextjs.org/docs/app/building-your-application/upgrading/version-15)**

## Key Breaking Changes

1. **React 19 required**: Upgrade React and React DOM
2. **Async Request APIs**: `cookies()`, `headers()`, `params`, `searchParams` are now async
3. **Fetch caching changed**: Not cached by default (was cached)
4. **GET route handlers**: Not cached by default
5. **`geo` and `ip` removed**: Use `@vercel/functions` instead

## After Upgrade

Check for manual fixes needed:
```bash
grep -rn "@next-codemod-error" --include="*.ts" --include="*.tsx" .
```