---
description: Learn how to set up Next.js with three commonly used testing tools — Cypress, Jest, and React Testing Library.
---

# Testing

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-cypress">Next.js with Cypress</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-jest">Next.js with Jest and React Testing Library</a></li>
  </ul>
</details>

Learn how to set up Next.js with three commonly used testing tools: [Cypress](https://www.cypress.io/blog/2021/04/06/cypress-component-testing-react/), [Jest](https://jestjs.io/docs/tutorial-react), and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

## Cypress

Cypress is a test runner used for **End-to-End (E2E)** and **Integration Testing**.

### Quickstart

You can use `create-next-app` with the [with-cypress example](https://github.com/vercel/next.js/tree/canary/examples/with-cypress) to quickly get started.

```bash
npx create-next-app --example with-cypress with-cypress-app
```

### Manual setup

To get started with Cypress, install the `cypress` package:

```bash
npm install --save-dev cypress
```

Add Cypress to the `package.json` scripts field:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "cypress": "cypress open",
}
```

Run Cypress for the first time to generate examples that use their recommended folder structure:

```bash
npm run cypress
```

You can look through the generated examples and the [Writing Your First Test](https://docs.cypress.io/guides/getting-started/writing-your-first-test) section of the Cypress Documentation to help you get familiar with Cypress.

### Creating your first Cypress integration test

Assuming the following two Next.js pages:

```jsx
// pages/index.js
import Link from 'next/link'

export default function Home() {
  return (
    <nav>
      <Link href="/about">
        <a>About</a>
      </Link>
    </nav>
  )
}
```

```jsx
// pages/about.js
export default function About() {
  return (
    <div>
      <h1>About Page</h1>
    </div>
  )
}
```

Add a test to check your navigation is working correctly:

```jsx
// cypress/integration/app.spec.js

describe('Navigation', () => {
  it('should navigate to the about page', () => {
    // Start from the index page
    cy.visit('http://localhost:3000/')

    // Find a link with an href attribute containing "about" and click it
    cy.get('a[href*="about"]').click()

    // The new url should include "/about"
    cy.url().should('include', '/about')

    // The new page should contain an h1 with "About page"
    cy.get('h1').contains('About Page')
  })
})
```

You can use `cy.visit("/")` instead of `cy.visit("http://localhost:3000/")` if you add `"baseUrl": "http://localhost:3000"` to the `cypress.json` configuration file.

### Running your Cypress tests

Since Cypress is testing a real Next.js application, it requires the Next.js server to be running prior to starting Cypress. We recommend running your tests against your production code to more closely resemble how your application will behave.

Run `npm run build` and `npm run start`, then run `npm run cypress` in another terminal window to start Cypress.

> **Note:** Alternatively, you can install the `start-server-and-test` package and add it to the `package.json` scripts field: `"test": "start-server-and-test start http://localhost:3000 cypress"` to start the Next.js production server in conjuction with Cypress. Remember to rebuild your application after new changes.

### Getting ready for Continuous Integration (CI)

You will have noticed that running Cypress so far has opened an interactive browser which is not ideal for CI environments. You can also run Cypress headlessly using the `cypress run` command:

```json
// package.json

"scripts": {
  //...
  "cypress": "cypress open",
  "cypress:headless": "cypress run",
  "e2e": "start-server-and-test start http://localhost:3000 cypress",
  "e2e:headless": "start-server-and-test start http://localhost:3000 cypress:headless"
}
```

You can learn more about Cypress and Continuous Integration from these resources:

- [Cypress Continuous Integration Docs](https://docs.cypress.io/guides/continuous-integration/introduction)
- [Cypress GitHub Actions Guide](https://on.cypress.io/github-actions)
- [Official Cypress Github Action](https://github.com/cypress-io/github-action)

## Jest and React Testing Library

Jest and React Testing Library are frequently used together for **Unit Testing**.

### Quickstart

You can use `create-next-app` with the [with-jest example](https://github.com/vercel/next.js/tree/canary/examples/with-jest) to quickly get started with Jest and React Testing Library:

```bash
npx create-next-app --example with-jest with-jest-app
```

### Manual setup

To manually set up Jest and React Testing Library, install `jest` , `@testing-library/react`, `@testing-library/jest-dom` as well as some supporting packages:

```bash
npm install --save-dev jest babel-jest @testing-library/react @testing-library/jest-dom identity-obj-proxy react-test-renderer
```

**Configuring Jest**

Create a `jest.config.js` file in your project's root directory and add the following configuration options:

```jsx
// jest.config.js

module.exports = {
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  moduleNameMapper: {
    /* Handle CSS imports (with CSS modules)
    https://jestjs.io/docs/webpack#mocking-css-modules */
    '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',

    // Handle CSS imports (without CSS modules)
    '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',

    /* Handle image imports
    https://jestjs.io/docs/webpack#handling-static-assets */
    '^.+\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js',
  },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
  testEnvironment: 'jsdom',
  transform: {
    /* Use babel-jest to transpile tests with the next/babel preset
    https://jestjs.io/docs/configuration#transform-objectstring-pathtotransformer--pathtotransformer-object */
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
}
```

You can learn more about each option above in the [Jest docs](https://jestjs.io/docs/configuration).

**Handling stylesheets and image imports**

These files aren't useful in tests but importing them may cause errors, so we will need to mock them. Create the mock files we referenced in the configuration above - `fileMock.js` and `styleMock.js` - inside a `__mocks__` directory:

```json
// __mocks__/fileMock.js

(module.exports = "test-file-stub")
```

```json
// __mocks__/styleMock.js

module.exports = {};
```

For more information on handling static assets, please refer to the [Jest Docs](https://jestjs.io/docs/webpack#handling-static-assets).

**Extend Jest with custom matchers**

`@testing-library/jest-dom` includes a set of convenient [custom matchers](https://github.com/testing-library/jest-dom#custom-matchers) such as `.toBeInTheDocument()` making it easier to write tests. You can import the custom matchers for every test by adding the following option to the Jest configuration file:

```json
// jest.config.js

setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
```

Then, inside `jest.setup.js`, add the following import:

```jsx
// jest.setup.js

import '@testing-library/jest-dom/extend-expect'
```

If you need to add more setup options before each test, it's common to add them to the `jest.setup.js` file above.

**Absolute Imports and Module Path Aliases**

If your project is using [Module Path Aliases](https://nextjs.org/docs/advanced-features/module-path-aliases), you will need to configure Jest to resolve the imports by matching the paths option in the `jsconfig.json` file with the `moduleNameMapper` option in the `jest.config.js` file. For example:

```json
// tsconfig.json or jsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/components/*": ["components/*"]
    }
  }
}
```

```jsx
// jest.config.js
moduleNameMapper: {
  '^@/components/(.*)$': '<rootDir>/components/$1',
}
```

**Add a test script to package.json**

Add the Jest executable in watch mode to the `package.json` scripts:

```jsx
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "jest --watch"
}
```

`jest --watch` will re-run tests when a file is changed. For more Jest CLI options, please refer to the [Jest Docs](https://jestjs.io/docs/cli#reference).

**Create your first tests**

Your project is now ready to run tests. Follow Jests convention by adding tests to the `__tests__` folder in your project's root directory.

For example, we can add a test to check if the `<Index />` component successfully renders a heading:

```jsx
// __tests__/index.test.jsx

/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import Home from '../pages/index'

describe('Home', () => {
  it('renders a heading', () => {
    render(<Home />)

    const heading = screen.getByRole('heading', {
      name: /welcome to next\.js!/i,
    })

    expect(heading).toBeInTheDocument()
  })
})
```

> **Note**: The `@jest-environment jsdom` comment above configures the testing environment as `jsdom` inside the test file because React Testing Library uses DOM elements like `document.body` which will not work in Jest's default `node` testing environment. Alternatively, you can also set the `jsdom` environment globally by adding the Jest configuration option: `"testEnvironment": "jsdom"` in `jest.config.js`.

Optionally, add a [snapshot test](https://jestjs.io/docs/snapshot-testing) to keep track of any unexpected changes to your `<Index />` component:

```jsx
// __tests__/snapshot.js
import React from 'react'
import renderer from 'react-test-renderer'
import Index from '../pages/index'

it('renders homepage unchanged', () => {
  const tree = renderer.create(<Index />).toJSON()
  expect(tree).toMatchSnapshot()
})
```

> **Note**: Test files should not be included inside the pages directory because any files inside the pages directory are considered routes.

**Running your test suite**

Run `npm run jest` to run your test suite. After your tests pass or fail, you will notice a list of interactive Jest commands that will be helpful as you add more tests.

For further reading, you may find these resources helpful:

- [Jest Docs](https://jestjs.io/docs/getting-started)
- [React Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Playground](https://testing-playground.com/) - use good testing practices to match elements.

## Community Packages and Examples

The Next.js community has created packages and articles you may find helpful:

- [next-page-tester](https://github.com/toomuchdesign/next-page-tester) for DOM Integration Testing.
- [next-router-mock](https://github.com/scottrippey/next-router-mock) for Storybook.
- [Test Preview Vercel Deploys with Cypress](https://glebbahmutov.com/blog/develop-preview-test/) by Gleb Bahmutov.

For more information on what to read next, we recommend:

<div class="card">
  <a href="/docs/basic-features/environment-variables#test-environment-variable.md">
    <b>Test Environment Variables</b>
    <small>Learn more about the test environment variables.</small>
  </a>
</div>
