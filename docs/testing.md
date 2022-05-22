---
description: Learn how to set up Next.js with three commonly used testing tools — Cypress, Playwright, Jest, and React Testing Library.
---

# Testing

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-cypress">Next.js with Cypress</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-playwright">Next.js with Playwright</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-jest">Next.js with Jest and React Testing Library</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-vitest">Next.js with Vitest</a></li>
  </ul>
</details>

Learn how to set up Next.js with commonly used testing tools: [Cypress](https://nextjs.org/docs/testing#cypress), [Playwright](https://nextjs.org/docs/testing#playwright), and [Jest with React Testing Library](https://nextjs.org/docs/testing#jest-and-react-testing-library).

## Cypress

Cypress is a test runner used for **End-to-End (E2E)** and **Integration Testing**.

### Quickstart

You can use `create-next-app` with the [with-cypress example](https://github.com/vercel/next.js/tree/canary/examples/with-cypress) to quickly get started.

```bash
npx create-next-app@latest --example with-cypress with-cypress-app
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

> **Note:** Alternatively, you can install the `start-server-and-test` package and add it to the `package.json` scripts field: `"test": "start-server-and-test start http://localhost:3000 cypress"` to start the Next.js production server in conjunction with Cypress. Remember to rebuild your application after new changes.

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
- [Official Cypress GitHub Action](https://github.com/cypress-io/github-action)

## Playwright

Playwright is a testing framework that lets you automate Chromium, Firefox, and WebKit with a single API. You can use it to write **End-to-End (E2E)** and **Integration** tests across all platforms.

### Quickstart

The fastest way to get started, is to use `create-next-app` with the [with-playwright example](https://github.com/vercel/next.js/tree/canary/examples/with-playwright). This will create a Next.js project complete with Playwright all set up.

```bash
npx create-next-app@latest --example with-playwright with-playwright-app
```

### Manual setup

You can also use `npm init playwright` to add Playwright to an existing `NPM` project.

To manually get started with Playwright, install the `@playwright/test` package:

```bash
npm install --save-dev @playwright/test
```

Add Playwright to the `package.json` scripts field:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test:e2e": "playwright test",
}
```

### Creating your first Playwright end-to-end test

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

Add a test to verify that your navigation is working correctly:

```jsx
// e2e/example.spec.ts

import { test, expect } from '@playwright/test'

test('should navigate to the about page', async ({ page }) => {
  // Start from the index page (the baseURL is set via the webServer in the playwright.config.ts)
  await page.goto('http://localhost:3000/')
  // Find an element with the text 'About Page' and click on it
  await page.click('text=About Page')
  // The new url should be "/about" (baseURL is used there)
  await expect(page).toHaveURL('http://localhost:3000/about')
  // The new page should contain an h1 with "About Page"
  await expect(page.locator('h1')).toContainText('About Page')
})
```

You can use `page.goto("/")` instead of `page.goto("http://localhost:3000/")`, if you add [`"baseURL": "http://localhost:3000"`](https://playwright.dev/docs/api/class-testoptions#test-options-base-url) to the `playwright.config.ts` configuration file.

### Running your Playwright tests

Since Playwright is testing a real Next.js application, it requires the Next.js server to be running prior to starting Playwright. It is recommended to run your tests against your production code to more closely resemble how your application will behave.

Run `npm run build` and `npm run start`, then run `npm run test:e2e` in another terminal window to run the Playwright tests.

> **Note:** Alternatively, you can use the [`webServer`](https://playwright.dev/docs/test-advanced#launching-a-development-web-server-during-the-tests) feature to let Playwright start the development server and wait until it's fully available.

### Running Playwright on Continuous Integration (CI)

Playwright will by default run your tests in the [headless mode](https://playwright.dev/docs/ci#running-headed). To install all the Playwright dependencies, run `npx playwright install-deps`.

You can learn more about Playwright and Continuous Integration from these resources:

- [Getting started with Playwright](https://playwright.dev/docs/intro)
- [Use a development server](https://playwright.dev/docs/test-advanced#launching-a-development-web-server-during-the-tests)
- [Playwright on your CI provider](https://playwright.dev/docs/ci)

## Jest and React Testing Library

Jest and React Testing Library are frequently used together for **Unit Testing**. There are three ways you can start using Jest within your Next.js application:

1. Using one of our [quickstart examples](https://nextjs.org/docs/testing#quickstart-2)
2. With the [Next.js Rust Compiler](https://nextjs.org/docs/testing#setting-up-jest-with-the-rust-compiler)
3. With [Babel](https://nextjs.org/docs/testing#setting-up-jest-with-babel)

The following sections will go through how you can set up Jest with each of these options:

### Quickstart

You can use `create-next-app` with the [with-jest](https://github.com/vercel/next.js/tree/canary/examples/with-jest) example to quickly get started with Jest and React Testing Library:

```bash
npx create-next-app@latest --example with-jest with-jest-app
```

### Setting up Jest (with the Rust Compiler)

Since the release of [Next.js 12](https://nextjs.org/blog/next-12), Next.js now has built-in configuration for Jest.

To set up Jest, install `jest`, `jest-environment-jsdom`, `@testing-library/react`, `@testing-library/jest-dom`:

```bash
npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom
```

Create a `jest.config.js` file in your project's root directory and add the following:

```jsx
// jest.config.js
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  // Add more setup options before each test is run
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // if using TypeScript with a baseUrl set to the root directory then you need the below for alias' to work
  moduleDirectories: ['node_modules', '<rootDir>/'],
  testEnvironment: 'jest-environment-jsdom',
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
```

Under the hood, `next/jest` is automatically configuring Jest for you, including:

- Setting up `transform` using [SWC](https://nextjs.org/docs/advanced-features/compiler)
- Auto mocking stylesheets (`.css`, `.module.css`, and their scss variants) and image imports
- Loading `.env` (and all variants) into `process.env`
- Ignoring `node_modules` from test resolving and transforms
- Ignoring `.next` from test resolving
- Loading `next.config.js` for flags that enable SWC transforms

### Setting up Jest (with Babel)

If you opt-out of the [Rust Compiler](https://nextjs.org/docs/advanced-features/compiler), you will need to manually configure Jest and install `babel-jest` and `identity-obj-proxy` in addition to the packages above.

Here are the recommended options to configure Jest for Next.js:

```jsx
// jest.config.js
module.exports = {
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  moduleNameMapper: {
    // Handle CSS imports (with CSS modules)
    // https://jestjs.io/docs/webpack#mocking-css-modules
    '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',

    // Handle CSS imports (without CSS modules)
    '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',

    // Handle image imports
    // https://jestjs.io/docs/webpack#handling-static-assets
    '^.+\\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$/i': `<rootDir>/__mocks__/fileMock.js`,

    // Handle module aliases
    '^@/components/(.*)$': '<rootDir>/components/$1',
  },
  // Add more setup options before each test is run
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
  testEnvironment: 'jsdom',
  transform: {
    // Use babel-jest to transpile tests with the next/babel preset
    // https://jestjs.io/docs/configuration#transform-objectstring-pathtotransformer--pathtotransformer-object
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
}
```

You can learn more about each configuration option in the [Jest docs](https://jestjs.io/docs/configuration).

**Handling stylesheets and image imports**

Stylesheets and images aren't used in the tests but importing them may cause errors, so they will need to be mocked. Create the mock files referenced in the configuration above - `fileMock.js` and `styleMock.js` - inside a `__mocks__` directory:

```js
// __mocks__/fileMock.js
module.exports = {
  src: '/img.jpg',
  height: 24,
  width: 24,
  blurDataURL: 'data:image/png;base64,imagedata',
}
```

```js
// __mocks__/styleMock.js
module.exports = {}
```

For more information on handling static assets, please refer to the [Jest Docs](https://jestjs.io/docs/webpack#handling-static-assets).

**Optional: Extend Jest with custom matchers**

`@testing-library/jest-dom` includes a set of convenient [custom matchers](https://github.com/testing-library/jest-dom#custom-matchers) such as `.toBeInTheDocument()` making it easier to write tests. You can import the custom matchers for every test by adding the following option to the Jest configuration file:

```js
// jest.config.js
setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
```

Then, inside `jest.setup.js`, add the following import:

```jsx
// jest.setup.js
import '@testing-library/jest-dom/extend-expect'
```

If you need to add more setup options before each test, it's common to add them to the `jest.setup.js` file above.

**Optional: Absolute Imports and Module Path Aliases**

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

### Creating your tests:

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

For example, we can add a test to check if the `<Home />` component successfully renders a heading:

```jsx
// __tests__/index.test.jsx

import { render, screen } from '@testing-library/react'
import Home from '../pages/index'
import '@testing-library/jest-dom'

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

Optionally, add a [snapshot test](https://jestjs.io/docs/snapshot-testing) to keep track of any unexpected changes to your `<Home />` component:

```jsx
// __tests__/snapshot.js

import { render } from '@testing-library/react'
import Home from '../pages/index'

it('renders homepage unchanged', () => {
  const { container } = render(<Home />)
  expect(container).toMatchSnapshot()
})
```

> **Note**: Test files should not be included inside the pages directory because any files inside the pages directory are considered routes.

**Running your test suite**

Run `npm run test` to run your test suite. After your tests pass or fail, you will notice a list of interactive Jest commands that will be helpful as you add more tests.

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
  <a href="/docs/basic-features/environment-variables#test-environment-variables.md">
    <b>Test Environment Variables</b>
    <small>Learn more about the test environment variables.</small>
  </a>
</div>
