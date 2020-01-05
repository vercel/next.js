# Invalid React Version

#### Why This Error Occurred

You tried running `next` in a project with an incompatible react version. Next.js uses certain react features that when are unavailable show this error since it can't work without them.

#### Possible Ways to Fix It

Run `npm i react@latest react-dom@latest` or `yarn add react@latest react-dom@latest` in your project and then try running `next` again.
