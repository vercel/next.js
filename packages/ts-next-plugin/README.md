# `ts-next-plugin`

This is a TypeScript Language Server plugin for the Next.js app directory.

## What it does

### 🗄️ Server Layer

- Hide autocompletions for disallowed APIs such as `useState`
- Show errors if disallowed APIs such as `useState` are used

### 📺 Client Layer

- Intellisense for client boundary modules
- autocompletion (prop hints) such as params and `searchParams` for pages, and named slots for layouts
- error if unserializable props passed to exported functions
- error if there are extra exports in page and layout
- error if `"use client";` directive isn't above other expressions

### ⚙️ Config Files

- Autocompletion and docs for configs
- Hover hints for configs
- error on invalid configs
