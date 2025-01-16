These are manually compiled versions from `src/index`.js with [React Compiler Playground](https://playground.react.dev/) and [Babel.js Repl](https://babeljs.io/repl) (only to compile JSX runtime).

| module                                   | import condition | resolved                             | React Compiler | Server-Client boundary | Valid environment |
|------------------------------------------|------------------|--------------------------------------|----------------|------------------------|-------------------|
| `reference-library/client`               | any              | `./compiled/client.js`               | Yes            | Yes                    | client-only       |
| `reference-library`                      | `react-server`   | `./compiled/index.react-server.js`   | No             | No                     | any               |
| `reference-library`                      | default          | `./compiled/index.js`   | Yes            | No                     | client-only       |
| `reference-library/missing-react-server` | any              | `./compiled/missing-react-server.js` | Yes            | No                     | client-only       |
