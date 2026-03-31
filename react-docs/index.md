---
title: React Reference Overview
---

<Intro>

This section provides detailed reference documentation for working with React. For an introduction to React, please visit the [Learn](/learn) section.

</Intro>

The React reference documentation is broken down into functional subsections:

## React {/_react_/}

Programmatic React features:

- [Hooks](/reference/react/hooks) - Use different React features from your components.
- [Components](/reference/react/components) - Built-in components that you can use in your JSX.
- [APIs](/reference/react/apis) - APIs that are useful for defining components.
- [Directives](/reference/rsc/directives) - Provide instructions to bundlers compatible with React Server Components.

## React DOM {/_react-dom_/}

React DOM contains features that are only supported for web applications (which run in the browser DOM environment). This section is broken into the following:

- [Hooks](/reference/react-dom/hooks) - Hooks for web applications which run in the browser DOM environment.
- [Components](/reference/react-dom/components) - React supports all of the browser built-in HTML and SVG components.
- [APIs](/reference/react-dom) - The `react-dom` package contains methods supported only in web applications.
- [Client APIs](/reference/react-dom/client) - The `react-dom/client` APIs let you render React components on the client (in the browser).
- [Server APIs](/reference/react-dom/server) - The `react-dom/server` APIs let you render React components to HTML on the server.
- [Static APIs](/reference/react-dom/static) - The `react-dom/static` APIs let you generate static HTML for React components.

## React Compiler {/_react-compiler_/}

The React Compiler is a build-time optimization tool that automatically memoizes your React components and values:

- [Configuration](/reference/react-compiler/configuration) - Configuration options for React Compiler.
- [Directives](/reference/react-compiler/directives) - Function-level directives to control compilation.
- [Compiling Libraries](/reference/react-compiler/compiling-libraries) - Guide for shipping pre-compiled library code.

## ESLint Plugin React Hooks {/_eslint-plugin-react-hooks_/}

The [ESLint plugin for React Hooks](/reference/eslint-plugin-react-hooks) helps enforce the Rules of React:

- [Lints](/reference/eslint-plugin-react-hooks) - Detailed documentation for each lint with examples.

## Rules of React {/_rules-of-react_/}

React has idioms — or rules — for how to express patterns in a way that is easy to understand and yields high-quality applications:

- [Components and Hooks must be pure](/reference/rules/components-and-hooks-must-be-pure) – Purity makes your code easier to understand, debug, and allows React to automatically optimize your components and hooks correctly.
- [React calls Components and Hooks](/reference/rules/react-calls-components-and-hooks) – React is responsible for rendering components and hooks when necessary to optimize the user experience.
- [Rules of Hooks](/reference/rules/rules-of-hooks) – Hooks are defined using JavaScript functions, but they represent a special type of reusable UI logic with restrictions on where they can be called.

## Legacy APIs {/_legacy-apis_/}

- [Legacy APIs](/reference/react/legacy) - Exported from the `react` package, but not recommended for use in newly written code.
