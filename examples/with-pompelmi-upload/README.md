# with-pompelmi-upload

A minimal Next.js App Router example showing how to scan uploaded files with Pompelmi before storage or further processing.

## Features

- App Router
- Route Handler upload endpoint
- In-process file scanning
- Simple JSON verdict response

## Run locally

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000 and upload a file.

Notes

This example demonstrates how to place scanning logic at the upload boundary using @pompelmi/next-upload.