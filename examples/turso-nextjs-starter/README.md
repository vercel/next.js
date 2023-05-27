# Turso Next.js Starter

This is a [Next.js] starter template that uses [Turso] to store data and
[Tailwindcss] for styling.

## Demo

https://turso-nextjs-starter.vercel.app

## Prerequisites

- [Node.js]
- [The Turso CLI]
- Authenticate the Turso CLI with the following command:

```sh
turso auth login
```

## Set up the starter Nexts.js app

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example turso-nextjs-starter turso-nextjs-starter-app
```

```bash
yarn create next-app --example turso-nextjs-starter turso-nextjs-starter-app
```

```bash
pnpm create next-app --example turso-nextjs-starter turso-nextjs-starter-app
```

## Setting up the database

Create a new turso database:

```sh
turso db create web-frameworks
```

> **Note**
>
> We use `web-frameworks` as the database name in this command, but you can give
> it any name.

Access the database through the Turso CLI shell:

```sh
turso db shell web-frameworks
```

Issue the following statements to create tables and their indexes in the database:

```sql
-- create the "frameworks" table
create table frameworks (
  id integer primary key,
  name varchar (50) not null,
  language varchar (50) not null,
  url text not null,
  stars integer not null
);

-- name column unique index
create unique index idx_frameworks_name ON frameworks (name);

-- url column unique index
create unique index idx_frameworks_url ON frameworks (url);
```

Seed the database with some data:

```sql
insert into frameworks(name, language, url, stars) values("Vue".js , "JavaScript", "https://github.com/vuejs/vue", 203000);
insert into frameworks(name, language, url, stars) values("React", "JavaScript", "https://github.com/facebook/react", 206000);
insert into frameworks(name, language, url, stars) values("Angular", "TypeScript", "https://github.com/angular/angular", 87400);
insert into frameworks(name, language, url, stars) values("ASP.NET Core", "C#", "https://github.com/dotnet/aspnetcore", 31400);
insert into frameworks(name, language, url, stars) values("Express", "JavaScript", "https://github.com/expressjs/express", 60500);
insert into frameworks(name, language, url, stars) values("Django", "Python", "https://github.com/django/django", 69800);
insert into frameworks(name, language, url, stars) values("Ruby on Rails", "Ruby", "https://github.com/rails/rails", 52600);
insert into frameworks(name, language, url, stars) values("Spring", "Java", "https://github.com/spring-projects/spring-framework", 51400);
insert into frameworks(name, language, url, stars) values("Laravel", "PHP", "https://github.com/laravel/laravel", 73100);
insert into frameworks(name, language, url, stars) values("Flask", "Python", "https://github.com/pallets/flask", 62500);
insert into frameworks(name, language, url, stars) values("Ruby", "Ruby", "https://github.com/ruby/ruby", 41000);
insert into frameworks(name, language, url, stars) values("Symfony", "PHP", "https://github.com/symfony/symfony", 28200);
insert into frameworks(name, language, url, stars) values("CodeIgniter", "PHP", "https://github.com/bcit-ci/CodeIgniter", 18200);
insert into frameworks(name, language, url, stars) values("CakePHP", "PHP", "https://github.com/cakephp/cakephp", 8600);
insert into frameworks(name, language, url, stars) values("Qwik", "TypeScript", "https://github.com/BuilderIO/qwik", 16400);
```

To access the data stored inside your database, you need the Turso database url and an authentication token which can be obtained using the following commands.

For the database url, run the following command:

```sh
turso db show web-frameworks --url
```

And, for an authentication token for the database, run:

```sh
turso db tokens create web-frameworks
```

Rename the `.env.example` file at to `.env.local` and populate it with the values obtained above.

## Run the app

Run the app with the command:

```sh
npm run dev
```

Open your browser at [localhost:3000] to see the running application.

## Deploy your own

Deploy the example using [Vercel]:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/turso-nextjs-starter&project-name=turso-nextjs-starter&repository-name=turso-nextjs-starter&env=NEXT_TURSO_DB_URL,NEXT_TURSO_DB_AUTH_TOKEN)

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

[next.js]: https://nextjs.org/
[turso]: https://turso.tech
[tailwindcss]: https://tailwindcss.com
[node.js]: https://nodejs.org/en/download/
[install the turso cli]: https://docs.turso.tech/reference/turso-cli#installation
[the turso cli]: https://docs.turso.tech/reference/turso-cli#installation
[vercel]: https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example
[localhost:3000]: localhost:3000
