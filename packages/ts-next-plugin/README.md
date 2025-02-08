# `ts-next-plugin`

This is a TypeScript Language Server plugin for the Next.js app directory.

## What it does

### Intellisense

- \[Server Layer\] Hide autocompletions for disallowed APIs such as `useState`
- \[Client Layer\] autocompletion (prop hints) such as params and `searchParams` for pages, and named slots for layouts
- \[Config Files\] Autocompletion and docs for configs
- \[Config Files\] Hover hints for configs
- \[Client Layer\] Intellisense for client boundary modules

### Errors

- \[Server Layer\] Show errors if disallowed APIs such as `useState` are used
- invalid props
- \[Config Files\] invalid configs
- \[Page Exports\] extra exports in page and layout
- \[Client Layer\] `"use client";` directive isn't above other expressions
- unserializable props passed to exported functions
