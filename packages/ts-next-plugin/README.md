# `ts-next-plugin`

This is a TypeScript Language Server plugin for the Next.js app directory.

## What it does

### 🗄️ Server Layer

- Error ts(71016): the `'use client'` directive is used at the same time as `'use server'` directive
- Error ts(71015): the `'use server'` directive must be above all other expressions
- Error ts(71011): validates that server files can only export async functions
- Error ts(71001): the following `react` and `react-dom` APIs are not allowed in Server Components: `useState`, `useEffect`, `useLayoutEffect`, `useDeferredValue`, `useImperativeHandle`, `useInsertionEffect`, `useReducer`, `useRef`, `useSyncExternalStore`, `useTransition`, `Component`, `PureComponent`, `createContext`, `createFactory`, `experimental_useOptimistic`, `useOptimistic`, and `useActionState`.
- Hide autocompletions for disallowed APIs such as `useState`
- Show errors if disallowed APIs such as `useState` are used

### 📺 Client Layer

- Error ts(71006): `AMP` is not supported in the app directory.
- Error ts(71017): pages may only use the props `params` and `searchParams`
- Error ts(71018): layouts may only use the props `params` and `children`
- Error ts(71014): the `'use client'` directive must be above all other expressions
- Error ts(71009): [`Error` and `GlobalError` component files](https://nextjs.org/docs/app/api-reference/file-conventions/error) must have `'use client'`
- Error ts(71019): props must follow server action naming conventions
- Error ts(71020): props must be serializable
- Error ts(71021): Verifies Next.js client component exports
- Error ts(71022): validates the `metadata` export type
- Intellisense for client boundary modules
- autocompletion (prop hints) such as params and `searchParams` for pages, and named slots for layouts

### ⚙️ Config Files

- Error ts(71002): config files can only export the values: `config`, `generateStaticParams`, `metadata`, `generateMetadata`, `viewport`, and `generateViewport`.
- Error ts(71012): config values must match the schema
- Error ts(71013): config values must be serializable
- Autocompletion and docs for configs
- Hover hints for configs
