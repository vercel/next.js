# Turso

[Turso](https://turso.tech) is a SQLite-compatible database built on libSQL, the Open Contribution fork of SQLite. It enables scaling to hundreds of thousands of databases per organization and supports replication to any location, including your own servers, for microsecond-latency access.

- [Turso Documentation](https://docs.turso.tech)
- [Turso Support](https://discord.com/invite/4B5D7hYwub)

## Features

- Uses SQLite `dev.db` locally
- App Router
- Server Actions

## How to use

You can run this example locally using SQLite. The example will automatically create a `todos` table using the file `dev.db`.

Create a new Next app using the `with-turso` example:

```bash
npx create-next-app --example with-turso with-turso-app
```

```bash
yarn create next-app --example with-turso with-turso-app
```

```bash
pnpm create next-app --example with-turso with-turso-app
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

You should now be able to go to [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

You can deploy this app to Vercel in a few simple steps:

1. **Signup to Turso**

   Install the Turso CLI and login using GitHub:

   ```bash
   # macOS
   brew install tursodatabase/tap/turso

   # Windows (WSL) & Linux:
   # curl -sSfL https://get.tur.so/install.sh | bash
   ```

2. **Create a database**

   Begin by creating your first database:

   ```bash
   turso db create [database-name]
   ```

3. **Create a table**

   Connect to the turso shell and create your first table:

   ```bash
   turso db shell <database-name>
   ```

   ```bash
   CREATE TABLE todos(id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL)
   ```

4. **Retrieve database URL**

   You'll need to fetch your database URL and assign it to `TURSO_DB_URL` on deployment:

   ```bash
   turso db show <database-name> --url
   ```

5. **Create database auth token**

   Now create an access token and assign it to `TURSO_DB_TOKEN` on deployment:

   ```bash
   turso db tokens create <database-name>
   ```

6. **Deploy to Vercel**

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-turso&env=TURSO_DB_URL,TURSO_DB_TOKEN)
