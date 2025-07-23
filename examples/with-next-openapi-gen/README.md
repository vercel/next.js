# Next OpenAPI Gen

[Next OpenAPI Gen](https://github.com/tazo90/next-openapi-gen) automatically generates OpenAPI 3.0 documentation from Next.js projects, with support for Zod schemas and TypeScript types.

- [Next OpenAPI Gen Documentation](https://github.com/tazo90/next-openapi-gen)

## Features

- Automatic OpenAPI documentation generation from Next.js App Router
- Support for Zod schemas and TypeScript types
- Multiple UI interfaces (Scalar, Swagger, Redoc, Stoplight, RapiDoc)
- Path parameters detection from dynamic routes
- JSDoc comments support for enhanced documentation
- Built-in error response management

## How to use

Create a new Next.js app using the `with-next-openapi-gen` example:

```bash
npx create-next-app --example with-next-openapi-gen with-next-openapi-gen-app
```

```bash
yarn create next-app --example with-next-openapi-gen with-next-openapi-gen-app
```

```bash
pnpm create next-app --example with-next-openapi-gen with-next-openapi-gen-app
```

Then install the dependencies and run the Next.js development server:

```bash
npm install
npm run dev

# or

yarn install
yarn dev

# or

pnpm install
pnpm dev
```

Generate the OpenAPI documentation:

```bash
npm run docs:generate

# or

yarn docs:generate

# or

pnpm docs:generate
```

You should now be able to go to [http://localhost:3000](http://localhost:3000) to see the API and [http://localhost:3000/api-docs](http://localhost:3000/api-docs) to view the generated API documentation.

## Example API Routes

The example includes several documented API routes demonstrating different features:

- `GET /api/users` - List users with query parameters
- `GET /api/users/[id]` - Get user by ID with path parameters
- `POST /api/users` - Create user with request body validation
- `PUT /api/users/[id]` - Update user with authentication
- `DELETE /api/users/[id]` - Delete user

Each route demonstrates different JSDoc annotations like `@pathParams`, `@body`, `@response`, `@auth`, and `@deprecated`.

## Configuration

The example includes a pre-configured `next.openapi.json` file that specifies:

- API directory scanning (`/app/api`)
- Zod schema support
- Scalar UI interface
- Default error responses
- Documentation endpoint (`/api-docs`)

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-next-openapi-gen&project-name=with-next-openapi-gen&repository-name=with-next-openapi-gen)

The generated OpenAPI documentation will be automatically available at `/api-docs` after deployment.
