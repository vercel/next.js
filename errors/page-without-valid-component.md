# Page Without Valid React Component

#### Why This Error Occurred

While auto exporting a page a valid React Component wasn't found. This could mean you have a file in `pages` that exports something that is not a React Component.

#### Possible Ways to Fix It

Move any non-page files that don't export a React Component as the default export to a different folder like `components` or `lib`.
