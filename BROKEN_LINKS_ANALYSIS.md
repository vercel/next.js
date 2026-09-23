# Broken Links Analysis - nextjs.org

**Date:** 2026-01-27  
**Context:** Slack report from #feedback-docs showing 28 broken links on nextjs.org

These broken links appear on nextjs.org (served by vercel/front) but reference docs content from vercel/next.js.

## Broken Links and Their Correct Redirects

### 1. `/docs/advanced-features/customizing-postcss-config`

**Referenced from:** `nextjs.org/learn/pages-router/assets-metadata-css-styling-tips`  
**Should redirect to:** `/docs/pages/guides/post-css`  
**File exists at:** `docs/02-pages/02-guides/post-css.mdx`

### 2. `/docs/advanced-features/measuring-performance`

**Referenced from:** `nextjs.org/learn/seo/custom-reporting`  
**Should redirect to:** `/docs/app/api-reference/functions/use-report-web-vitals`  
**Alternative:** `/docs/app/guides/analytics`  
**File exists at:** `docs/01-app/03-api-reference/04-functions/use-report-web-vitals.mdx`

### 3. `/docs/advanced-features/preview-mode`

**Referenced from:** `nextjs.org/learn/pages-router/api-routes-api-routes-details`  
**Should redirect to:** `/docs/pages/guides/preview-mode`  
**File exists at:** `docs/02-pages/02-guides/preview-mode.mdx`

### 4. `/docs/api-routes/dynamic-api-routes`

**Referenced from:** `nextjs.org/learn/pages-router/api-routes-api-routes-details`  
**Should redirect to:** `/docs/pages/building-your-application/routing/api-routes`  
**File exists at:** `docs/02-pages/03-building-your-application/01-routing/07-api-routes.mdx`  
**Note:** The file covers dynamic API routes in its content

### 5. `/docs/app/api-reference/config/next-config-js/turbopackPersistentCaching`

**Referenced from:** `nextjs.org/blog/next-15-5`  
**Should redirect to:** `/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache`  
**File exists at:** `docs/01-app/03-api-reference/05-config/01-next-config-js/turbopackFileSystemCache.mdx`  
**Note:** The feature was likely renamed from "PersistentCaching" to "FileSystemCache"

### 6. `/docs/app/api-reference/functions/not-found`

**Referenced from:** Multiple pages including:

- `nextjs.org/docs/app/api-reference/components/image`
- `nextjs.org/docs`
- `nextjs.org/docs/app/api-reference`
- `nextjs.org/docs/app/api-reference/cli`
- `nextjs.org/docs/app/api-reference/config/next-config-js/compress`

**Current path is CORRECT:** `/docs/app/api-reference/functions/not-found`  
**File exists at:** `docs/01-app/03-api-reference/04-functions/not-found.mdx`  
**Issue:** This file EXISTS and should work. The problem may be:

- A build/deployment issue in vercel/front
- The file not being properly indexed
- A routing issue in the front repo

## Summary

**Action Required:**

1. Add redirects in `vercel/front` for old paths (#1-5)
2. Investigate why #6 is broken when the file exists

**Redirect Rules Needed (for vercel/front):**

```
/docs/advanced-features/customizing-postcss-config → /docs/pages/guides/post-css
/docs/advanced-features/measuring-performance → /docs/app/api-reference/functions/use-report-web-vitals
/docs/advanced-features/preview-mode → /docs/pages/guides/preview-mode
/docs/api-routes/dynamic-api-routes → /docs/pages/building-your-application/routing/api-routes
/docs/app/api-reference/config/next-config-js/turbopackPersistentCaching → /docs/app/api-reference/config/next-config-js/turbopackFileSystemCache
```

## Notes

- The `/docs` folder in `vercel/next.js` contains the source markdown files
- These files are served by the `vercel/front` repository at nextjs.org
- All referenced source files exist and are correctly structured in this repo
- The broken links are from external references (learn pages, blog) that point to old/renamed paths
- No changes needed in `vercel/next.js` docs content itself
