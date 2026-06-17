# Bundle Analyzer

A Next.js application for visualizing bundle sizes and analyzing dependencies using interactive treemaps.

This package is not published to npm. Instead it's built and vendored into the main `next` package during its build process.


## Features

- 📊 **Interactive Treemap**: Visualize bundle sizes with an interactive treemap interface
- 🎯 **Route-based Analysis**: Analyze bundle data for specific routes in your application
- 🔍 **Dependency Tracking**: View import chains and dependency relationships
- 🎨 **Filter Controls**: Filter by environment (client/server) and file types (JS/CSS/JSON/Assets)
- 🔎 **Search Functionality**: Search through files in your bundle

## Updating

When landing non-trivial changes, consider updating the demo site:
* Site: https://turbopack-bundle-analyzer-demo.vercel.sh/
* Repo: https://github.com/vercel/turbopack-bundle-analyzer-demo