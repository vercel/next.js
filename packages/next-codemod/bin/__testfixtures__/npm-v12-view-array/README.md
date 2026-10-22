Verifies that `upgrade` works with npm v12+. npm v12 always returns an array
from `npm view --json` and rejects unknown CLI flags such as `--field`; see
https://github.com/npm/cli/releases/tag/v12.0.0. Previously this failed with
`Invalid revision provided`.

`eslint` and `eslint-config-next` are included so that the `eslint` bump
derived from `eslint-config-next`'s peer dependencies is exercised. Without
handling the array output, `eslint` is silently left at `9.0.0`.

Run this fixture with npm v12+ on PATH:

```sh
pnpm test:upgrade-fixture bin/__testfixtures__/npm-v12-view-array 16.4.2
```

```diff
diff --git a/packages/next-codemod/bin/__testfixtures__/npm-v12-view-array/package.json b/packages/next-codemod/bin/__testfixtures__/npm-v12-view-array/package.json
index 9ebddb3fc6..b120fb8157 100644
--- a/packages/next-codemod/bin/__testfixtures__/npm-v12-view-array/package.json
+++ b/packages/next-codemod/bin/__testfixtures__/npm-v12-view-array/package.json
@@ -4,12 +4,12 @@
     "dev": "next dev"
   },
   "dependencies": {
-    "next": "16.4.0",
+    "next": "16.4.2",
     "react": "19.3.1",
     "react-dom": "19.3.1"
   },
   "devDependencies": {
-    "eslint": "9.0.0",
-    "eslint-config-next": "16.4.0"
+    "eslint": "9.39.5",
+    "eslint-config-next": "16.4.2"
   }
 }
```
