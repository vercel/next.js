# Global CSS Must Be in Your Custom <App>

#### Why This Error Occurred

An attempt to import Global CSS from a file other than `pages/_app.js` was made.

Global CSS cannot be used in files other than your Custom `<App>` due to its side-effects and ordering problems.

#### Possible Ways to Fix It

Relocate all Global CSS imports to your `pages/_app.js` file.
