Verifies that on pnpm v11+, upgrading an app that lives inside a pnpm
workspace writes `@types/react` / `@types/react-dom` overrides to the
workspace root's `pnpm-workspace.yaml` instead of creating a new one next to
the app's `package.json`.

A `pnpm-workspace.yaml` is what makes a directory a pnpm workspace root, so
creating one in `apps/web` would declare a nested workspace root: `apps/web`
would be cut off from the real root and stop resolving `@fixture/ui`
(`workspace:*`).

The overrides are scoped to the app with pnpm's `<package>><dependency>`
selector so sibling packages such as `@fixture/ui` keep their own
`@types/react` resolution.
See https://pnpm.io/settings/dependency-resolution#overrides.

Run this fixture with pnpm v11+ on PATH, from the app directory:

```sh
pnpm test:upgrade-fixture bin/__testfixtures__/pnpm-v11-workspace-overrides/apps/web latest
```

Expected: no `apps/web/pnpm-workspace.yaml` is created, and the root manifest
gains scoped overrides.

```diff
diff --git a/packages/next-codemod/bin/__testfixtures__/pnpm-v11-workspace-overrides/apps/web/package.json b/packages/next-codemod/bin/__testfixtures__/pnpm-v11-workspace-overrides/apps/web/package.json
--- a/packages/next-codemod/bin/__testfixtures__/pnpm-v11-workspace-overrides/apps/web/package.json
+++ b/packages/next-codemod/bin/__testfixtures__/pnpm-v11-workspace-overrides/apps/web/package.json
@@ -6,9 +6,9 @@
   "dependencies": {
     "@fixture/ui": "workspace:*",
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
diff --git a/packages/next-codemod/bin/__testfixtures__/pnpm-v11-workspace-overrides/pnpm-workspace.yaml b/packages/next-codemod/bin/__testfixtures__/pnpm-v11-workspace-overrides/pnpm-workspace.yaml
--- a/packages/next-codemod/bin/__testfixtures__/pnpm-v11-workspace-overrides/pnpm-workspace.yaml
+++ b/packages/next-codemod/bin/__testfixtures__/pnpm-v11-workspace-overrides/pnpm-workspace.yaml
@@ -1,8 +1,11 @@
 packages:
   - 'apps/*'
   - 'packages/*'
 allowBuilds:
   sharp: false
   unrs-resolver: false
+overrides:
+  '@fixture/web>@types/react': 19.0.0
+  '@fixture/web>@types/react-dom': 19.0.0
```

Note that the comment at the top of `pnpm-workspace.yaml` is dropped: `js-yaml`
cannot round-trip comments. The upgrade prints a warning saying so, and skips
the rewrite entirely when the overrides are already up to date.
