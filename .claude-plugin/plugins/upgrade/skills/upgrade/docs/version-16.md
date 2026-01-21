# Upgrading from Next.js 15 to 16

## Quick Reference

**Requirements**:
- Node.js 20.9+ (was 18.17+)
- React 19.2+
- TypeScript 5.1+

**Run upgrade command**:
```bash
npx @next/codemod@canary upgrade 16
```

## Official Documentation

For complete breaking changes and migration guide:
**[Next.js 16 Blog Post](https://nextjs.org/blog/next-16)**

## Key Breaking Changes

1. **Node.js 20.9+ required**: Upgrade Node.js
2. **Async APIs enforced**: Synchronous access to `cookies()`, `headers()`, etc. removed
3. **`middleware.ts` → `proxy.ts`**: File and export renamed
4. **Turbopack default**: Now the default bundler
5. **AMP support removed**: No longer supported
6. **`next lint` removed**: Use ESLint CLI directly
7. **Parallel routes**: Now require `default.js`
8. **`next/image` defaults changed**: See docs for details

## After Upgrade

Check for manual fixes needed:
```bash
grep -rn "@next-codemod-error" --include="*.ts" --include="*.tsx" .
```