# Next.js, FaunaDB and `httpOnly` Cookie Auth Flow with GraphQL

The following guide explains how to setup FaunaDB & Next.js in order to have a simple `httpOnly` cookie auth flow, using Apollo Server and react-query/graphql-request on the client, while being deployed in Vercel (a serverless environment).

These are some of the features that this setup provides:

- A somewhat secure auth flow with [httpOnly cookies](https://with-graphql-faunadb-cookie-auth.now.sh).
- Token validation on refresh and window focus thanks to `react-query`'s [`useQuery` API](https://github.com/tannerlinsley/react-query#useQuery). In other words, if the token associated with a user identity is invalidated with [`Logout`](https://docs.fauna.com/fauna/current/api/fql/functions/logout) or in any other way, the user is also logged out in the front-end (as soon as the window is focused or refreshed).
- A local GraphQL server which functions as a proxy that allows us to extend Fauna's GraphQL endpoint, and basically, let's us add local-only queries or mutations in order to extend the flexibility of remote queries or mutations, bringing great flexibility to the web-app. In this case, the proxy is used to create a `validCookie` query which runs before every login, signup or logout mutation to verify if the httpCookie token is valid or not, before delegating to the remote schema (the one located in Fauna's endpoint).

## Demo

[https://with-graphql-faunadb-cookie-auth.now.sh/](https://with-graphql-faunadb-cookie-auth.now.sh/)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-cookie-auth-fauna-apollo-server with-cookie-auth-fauna-apollo-server-app
# or
yarn create next-app --example with-cookie-auth-fauna-apollo-server with-cookie-auth-fauna-apollo-server-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-cookie-auth-fauna-apollo-server
cd with-cookie-auth-fauna-apollo-server
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

The following explains in detail how to setup Fauna while also linking to several resources in order to help you achieve the same result.

## Prerequisites

- Basic understanding of [GraphQL](https://www.apollographql.com/docs/apollo-server/schema/schema/).
- Basic understanding of [how to import and work with GraphQL schemas inside FaunaDB](https://docs.fauna.com/fauna/current/start/graphql).
- Basic understanding of [Vercel deployments](https://vercel.com/docs/v2/serverless-functions/introduction) and [limitations](https://vercel.com/docs/v2/platform/limits).
- Basic understanding of [Next.js API endpoints](https://nextjs.org/docs/api-routes/introduction).
- Basic understanding of [httpOnly cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies).
- Medium to advanced understanding of Apollo Server (at least [how to stitch schemas and delegate them](https://www.apollographql.com/docs/apollo-server/features/schema-stitching/)).
- Medium to advanced understanding of [Fauna Query Language (FQL)](https://docs.fauna.com/fauna/current/api/fql/), [User-Defined Functions (UDFs)](https://docs.fauna.com/fauna/current/api/graphql/functions), [User-Defined Roles](https://docs.fauna.com/fauna/current/security/roles) for both Collections and Functions, and lastly, [Attribute-Based Access Control (ABAC)](https://docs.fauna.com/fauna/current/security/abac)

## Setting up FaunaDB

Let's start by defining what we need from FaunaDB. In this case we need three things: A GraphQL schema, User Defined Functions (UDFs) with FQL, and User-Defined roles. So the very first step is to have a clean db in FaunaDB to work with. Go ahead and create that first.

## The GraphQL schema

We'll be using a simple schema, take a look at it [here](/lib/graphql/faunadbSchema.gql). It defines a couple of things:

- `UserRole`: which we will use for ABAC role definitions. A basic example of how to use them at least, so you can get a sense of what these do and are capable of.
- `User`: a user type, the only custom `type` in this schema, because I want to keep things as simple as possible. But notice here the usage of [`@unique`](https://docs.fauna.com/fauna/current/api/graphql/directives/d_unique), this tells Fauna to create an Index based on this field which we'll later use to login users. [Indexes](https://docs.fauna.com/fauna/current/api/fql/indexes) are a very important part of Fauna, because they allow the organization and retrieval of [Documents](https://docs.fauna.com/fauna/current/api/fql/documents) by their attributes, in this case Fauna will create an index which we can use to access the `User`s documents by their `email`.
- `input`s: `CreateUserInput` & `LoginUserInput`, which will define the data needed for our mutations.
- `Mutation`s: here we define the secret sauce of this whole thing through [`@resolver` directives](https://docs.fauna.com/fauna/current/api/graphql/directives/d_resolver). In short, a `@resolver` let's us define the name of an User Defined Function (UDF) used to resolve a mutation. This is the very next step we'll do in the following section.

Take this file and import it to the FaunaDB GraphQL endpoint using the "IMPORT SCHEMA" button in the dashboard, under the "GRAPHQL" menu option.

Once you do that, you'll get access to the usual GraphQL Playground. Click on the right tab "SCHEMA" and download an SDL version of the schema you just imported.

This is important because we want to avoid using [`introspectSchema` from Apollo Server](https://www.apollographql.com/docs/apollo-server/features/remote-schemas/#introspect-and-delegate-requests) due to the fact that we would be doing a roundtrip request for every first request the user does in order to download the remote schema, and this will make the user interaction feel sluggish.

So, since we want to avoid that, having a local copy in SDL format will help avoid that roundtrip request.

Copy all the contents from the recently downloaded SDL file inside [`remoteSchema.js`](/lib/graphql/remoteSchema.js) and be careful with the parsing, since we are saving all this as a string, you might need to replace a few `` ` ``s for `"`s, and unify some comments with `#` in order to have a correct parsed string.

## User Defined Functions (UDFs)

Here's where the magic starts. As you saw earlier we used `@resolver` directives to tell Fauna that we plan to define some functions. We'll do just that and define some more, in total we'll create 5 UDFs, 4 which will be used by the `@resolver` directives, and 1 which will be used directly by our local-defined schema (more on that later).

Check out the [`exampleFunctions.js`](/examples/with-cookie-auth-fauna-apollo-server/lib/fauna/exampleFunctions.js) file where I've defined these 5 functions. Note that in this file all functions are commented out because they are meant to be added in the function section of the Fauna Dashboard. Let's now explain what each one of these function does:

- `create_user`: Uses the [`Create` function](https://docs.fauna.com/fauna/current/api/fql/functions/create) along with the `credentials` field name to set permissions for the `User` document.
- `login_user`: Uses the [`Login` function](https://docs.fauna.com/fauna/current/api/fql/functions/login) to match the input data against the previously mentioned `credentials` and from the returned object we [`Select`](https://docs.fauna.com/fauna/current/api/fql/functions/select) the `secret`. Notice that we also use the field name `ttl` to set a time to live of 14 days from the login moment, but [as the docs specify](https://docs.fauna.com/fauna/current/api/fql/functions/login) this is not a guarantee for the token to expire at that precise point in time.
- `logout_user`: This one is easy. It simply uses the [`Logout` function](https://docs.fauna.com/fauna/current/api/fql/functions/logout) and passes the `true` parameter to tell Fauna to delete all tokens related to the current [`Identity`](https://docs.fauna.com/fauna/current/api/fql/functions/identity).
- `signup_user`: Here we use the [`Do` function](https://docs.fauna.com/fauna/current/api/fql/functions/do) to [`Call`](https://docs.fauna.com/fauna/current/api/fql/functions/call) the `create_user` and `login_user` functions in sequence. Bare in mind that `Do` returns the result of the latest `Call`ed function, which is precisely what we want.
- `validate_token`: Lastly the most important function in my opinion which unifies the whole concept of httpOnly cookies and takes care of syncing the user with the state of the [`Tokens`](https://docs.fauna.com/fauna/current/api/fql/functions/tokens) in the DB. It simply tells us if the passed token is valid or not, by passing it to [`KeyFromSecret`](https://docs.fauna.com/fauna/current/api/fql/functions/keyfromsecret) and evaluating if it is not null.

In order to create these functions, be sure to go to the "FUNCTIONS" menu in Fauna's dashboard, there you should already see at least the first 4 functions defined through the schema with an empty `Lambda`. These were automatically created during the import process in the previous step.

What you need to do is then copy-paste each function inside Fauna's dashboard. One important thing here is the "Role" dropdown selector (which is marked as optional). We will use these drop-downs to select the roles (which we'll create in the next step) that each function has. Ultimately, these roles simply define the resources, in other words, the privileges each function has access to.

## User Defined Roles

Here's a very important part to the whole ABAC implementation. It's a very flexible part of Fauna, which makes it really powerful, and so it can be tricky to configure if not done right from the beginning, or at least if not done with a plan in mind.

Here's the plan. We want to define roles for each function that we previously created, and then we want to define two more roles, one for the `User` document and lastly one role for public use, simply called `public`, where we will give access to a couple of functions that should be available to anyone _not logged in_.

In order to keep this short, because the roles can get quite large, I've created a file called [`exampleRoles.js`](/examples/with-cookie-auth-fauna-apollo-server/lib/fauna/exampleRoles.js) where you can take a look at all of them. Note again that in this file all roles are commented out because they are meant to be added through the web shell in the Fauna Dashboard. In the following points, I'll highlight anything important from each of those.

But before that, I want to focus your attention on the functions [`CreateRole`](https://docs.fauna.com/fauna/current/api/fql/functions/createrole) and [`Update`](https://docs.fauna.com/fauna/current/api/fql/functions/update). These will be quite used for you in order to create and update roles respectively, so here's how using these would look like:

```
// The logoutUser function role would look like:
CreateRole(
  {
    name: "fnc_role_logout_user",
    privileges: [
      {
        resource: Ref("tokens"),
        actions: {
          create: true,
          read: true
        }
      }
    ]
  }
)
```

You'll probably won't need to [`Update`](https://docs.fauna.com/fauna/current/api/fql/functions/update) the functions in this example, but just in case you need it. Please be careful with this function, specially when using it to update arrays (i.e: `privileges`). Arrays are not merged but totally replaced. You can check this with the following example where if you only pass `read: true`, `create` becomes `false` (as originally created with).

```
// This is a contrived example
Update(
  Role("fnc_role_logout_user"),
  {
    privileges: [
      {
        resource: Ref("tokens"),
        actions: {
          read: true
        }
      }
    ]
  }
)
```

Now let's examine each role:

- `fnd_role_create_user`: This creates a user under a specific condition, and that's only if the `role` the user is created with is marked as `FREE_USER`. This is just an example of how you can use any field available in input data and built-in Fauna function to create specific restrictions for your [User Defined Roles](https://docs.fauna.com/fauna/current/security/roles).
- `fnc_role_login_user`: This is where we provide access to the index mentioned in the schema section. The index is automatically created and called `unique_User_email`.
- `fnc_role_logout_user`: All roles are important, but logout is special because it's the first role which deals with [`Tokens`](https://docs.fauna.com/fauna/current/api/fql/functions/tokens). Tokens are [an essential part](https://docs.fauna.com/fauna/current/security/index.html#tokens) of the whole ABAC process and these are automatically created and added to an index with the same name each time you call the `Login` function.
- `fnc_role_signup_user`: Since we've already defined `create_user` and `login_user` and signing up a user is basically the same, we can reuse their privileges by simply being able to call them.
- `fnc_role_validate_token`: This functions requires to the index that the `Tokens` functions modifies, in this case we only need to read the items to evaluate if one specific token exists there or not.
- `free_user`: Here we want to define all the resources a logged in user should have access to. In this case we allow a logged in user to logout, and to validate tokens. This role also restricts `read` and `write` actions on the `User` collection by basically stating that a logged in user only can update or read his/her own data, and that the user can't modify it's role. Finally we define a membership for the role which tells Fauna that this role should be automatically applied to all `User` documents which have a specific `role`.
- `public`: lastly we define the `public` role, where we define which are the functions that every visitor (which is not logged in) should have. Notice that we don't directly provide access to the function `create_user`, this is handled under the hood by the `signup_user` function, which is allowed to be called in this instance.

## Setting Up Env Variables

You only need one env variable in your deployment, and it's for the `public` role. This is because it's the easiest way to provide access to your public functions without having to generate admin or server keys.

Simply go to your Fauna Dashboard and under "SECURITY" click "NEW KEY", there select role `public` and give it any name you want. The only thing left to do is to upload this key to your Production, Preview and Development environments [in Vercel](https://vercel.com/docs/v2/build-step#environment-variables) with the name `FAUNADB_PUBLIC_ACCESS_KEY`.

Notice that we only use `FAUNADB_PUBLIC_ACCESS_KEY` in [schema.js](/lib/graphql/schema.js) in the `contextlink` and it will be immediately swapped after obtaining a valid token through `Login`.

Finally just run `vc pull env` to create a `.env` file locally in order to run it on your machine.

## Credits

This example is possible because prior art has made this incredibly simple, work which was done by incredible talented people:

- Paul Patterson with his [great repo](https://github.com/ptpaterson/netlify-faunadb-graphql-auth) implementing the same cookie auth flow in Netlify. Thank you for the great feedback and help in Fauna's community Slack. Check out his [`overrideSchema.js`](https://github.com/ptpaterson/netlify-faunadb-graphql-auth/blob/master/functions/graphql/overrideSchema.js) file for an added step in schema transformation (`transformedRemoteSchema`), which filters out unneeded root fields for the client. You'll need that in a production environment.
- Next.js team and their incredible examples for Apollo Server ([1](https://github.com/vercel/next.js/tree/canary/examples/api-routes-apollo-server-and-client-auth), [2](https://github.com/vercel/next.js/tree/canary/examples/api-routes-apollo-server-and-client), [3](https://github.com/vercel/next.js/tree/canary/examples/api-routes-apollo-server)).
- FaunaDB team for their superb support and [docs](https://docs.fauna.com/fauna/current/index.html).
