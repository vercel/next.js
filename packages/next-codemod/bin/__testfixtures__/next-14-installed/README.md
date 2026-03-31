Prompts for React 19 upgrade with a recommendation to do so
Suggests adding `--turbopack` to `next dev` script
Suggests `app-dir-runtime-config-experimental-edge` transform
Suggests `next-async-request-api` transform
Suggests `next-request-geo-ip` transform

```diff
diff --git a/packages/next-codemod/bin/__testfixtures__/next-14-installed/package.json b/packages/next-codemod/bin/__testfixtures__/next-14-installed/package.json
index 5ec4c37f0b..131f5b9f4a 100644
--- a/packages/next-codemod/bin/__testfixtures__/next-14-installed/package.json
+++ b/packages/next-codemod/bin/__testfixtures__/next-14-installed/package.json
@@ -4,10 +4,16 @@
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
+  },
+  "pnpm": {
+    "overrides": {
+      "@types/react": "19.0.0",
+      "@types/react-dom": "19.0.0"
+    }
   }
 }
```
