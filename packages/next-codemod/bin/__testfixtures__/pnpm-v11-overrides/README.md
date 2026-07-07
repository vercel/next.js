Verifies that on pnpm v11+, `@types/react` / `@types/react-dom` overrides are
written to `pnpm-workspace.yaml#overrides` (merged into existing keys) rather
than `package.json#pnpm.overrides`. pnpm v11 silently ignores
`pnpm.overrides` in `package.json` — see
https://github.com/pnpm/pnpm/issues/11536 and https://pnpm.io/settings.

Run this fixture with pnpm v11+ on PATH:

```sh
pnpm test:upgrade-fixture bin/__testfixtures__/pnpm-v11-overrides latest
```

```diff
diff --git a/packages/next-codemod/bin/__testfixtures__/pnpm-v11-overrides/package.json b/packages/next-codemod/bin/__testfixtures__/pnpm-v11-overrides/package.json
index 5ec4c37f0b..131f5b9f4a 100644
--- a/packages/next-codemod/bin/__testfixtures__/pnpm-v11-overrides/package.json
+++ b/packages/next-codemod/bin/__testfixtures__/pnpm-v11-overrides/package.json
@@ -4,8 +4,8 @@
     "dev": "next dev"
   },
   "dependencies": {
-    "next": "14.3.0-canary.44",
-    "react": "18.2.0",
-    "react-dom": "18.2.0",
-    "@types/react": "^18.2.0",
-    "@types/react-dom": "^18.2.0"
+    "next": "15.0.4-canary.43",
+    "react": "19.0.0",
+    "react-dom": "19.0.0",
+    "@types/react": "19.0.0",
+    "@types/react-dom": "19.0.0"
   }
 }
diff --git a/packages/next-codemod/bin/__testfixtures__/pnpm-v11-overrides/pnpm-workspace.yaml b/packages/next-codemod/bin/__testfixtures__/pnpm-v11-overrides/pnpm-workspace.yaml
index ...
--- a/packages/next-codemod/bin/__testfixtures__/pnpm-v11-overrides/pnpm-workspace.yaml
+++ b/packages/next-codemod/bin/__testfixtures__/pnpm-v11-overrides/pnpm-workspace.yaml
@@ -1,2 +1,5 @@
 allowBuilds:
   sharp: false
+overrides:
+  '@types/react': 19.0.0
+  '@types/react-dom': 19.0.0
```
