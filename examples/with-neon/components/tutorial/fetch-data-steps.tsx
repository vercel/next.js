import { TutorialStep } from "./tutorial-step";
import { CodeBlock } from "./code-block";

const create = `create table notes (
  id bigserial primary key,
  title text
);

insert into notes(title)
values
  ('Today I created a Neon project.'),
  ('I added some data and queried it from Next.js.'),
  ('It was awesome!');
`.trim();

const server = `import { sql } from '@/lib/db'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function Notes() {
  await connection()
  const notes = await sql\`select * from notes\`

  return <pre>{JSON.stringify(notes, null, 2)}</pre>
}

export default function Page() {
  return (
    <Suspense>
      <Notes />
    </Suspense>
  )
}
`.trim();

const owner = `alter table notes
add column user_id uuid references neon_auth."user"(id) on delete cascade;`.trim();

const action = `import { auth } from '@/lib/auth/server'
import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

async function addNote(formData: FormData) {
  'use server'
  const { data } = await auth.getSession()
  if (!data?.user) redirect('/auth/login')

  const title = String(formData.get('title'))
  await sql\`insert into notes (title, user_id) values (\${title}, \${data.user.id})\`
  revalidatePath('/notes')
}

async function MyNotes() {
  const { data } = await auth.getSession()
  if (!data?.user) redirect('/auth/login')

  const notes = await sql\`select * from notes where user_id = \${data.user.id}\`

  return <pre>{JSON.stringify(notes, null, 2)}</pre>
}

export default function Page() {
  return (
    <>
      <form action={addNote}>
        <input name="title" required />
        <button type="submit">Add note</button>
      </form>
      <Suspense>
        <MyNotes />
      </Suspense>
    </>
  )
}
`.trim();

export function FetchDataSteps() {
  return (
    <ol className="flex flex-col gap-6">
      <TutorialStep title="Create some tables and insert some data">
        <p>
          Head over to the{" "}
          <a
            href="https://console.neon.tech"
            className="font-bold hover:underline text-foreground/80"
            target="_blank"
            rel="noreferrer"
          >
            SQL Editor
          </a>{" "}
          of your Neon project to create a table and insert some example data.
          If you&apos;re stuck for creativity, you can copy and paste the
          following and click Run!
        </p>
        <CodeBlock code={create} />
      </TutorialStep>

      <TutorialStep title="Query Neon data from Next.js">
        <p>
          The{" "}
          <a
            href="https://neon.com/docs/serverless/serverless-driver"
            className="font-bold hover:underline text-foreground/80"
            target="_blank"
            rel="noreferrer"
          >
            Neon serverless driver
          </a>{" "}
          runs each query over HTTP, so it works anywhere Next.js runs. To query
          data from an Async Server Component, create a new page.tsx file at{" "}
          <span className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs font-medium text-secondary-foreground border">
            /app/notes/page.tsx
          </span>{" "}
          and add the following.
        </p>
        <CodeBlock code={server} />
      </TutorialStep>

      <TutorialStep title="Give every user their own notes">
        <p>
          Neon Auth keeps your users in the{" "}
          <code>neon_auth.&quot;user&quot;</code> table of the same database, so
          you can reference them with a foreign key:
        </p>
        <CodeBlock code={owner} />
        <p>
          Then read the session in a Server Action and a Server Component to
          only insert and select the signed-in user&apos;s notes. Add{" "}
          <span className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs font-medium text-secondary-foreground border">
            /notes/:path*
          </span>{" "}
          to the matcher in{" "}
          <span className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs font-medium text-secondary-foreground border">
            proxy.ts
          </span>{" "}
          to require a signed-in user for this page.
        </p>
        <CodeBlock code={action} />
      </TutorialStep>

      <TutorialStep title="Branch your database and your users">
        <p>
          A{" "}
          <a
            href="https://neon.com/docs/introduction/branching"
            className="font-bold hover:underline text-foreground/80"
            target="_blank"
            rel="noreferrer"
          >
            Neon branch
          </a>{" "}
          is an instant copy of your database, including the users and sessions
          in <code>neon_auth</code>. Create one for every preview deployment to
          test schema changes and sign-in flows without touching production
          data.
        </p>
      </TutorialStep>

      <TutorialStep title="Build in a weekend and scale to millions!">
        <p>You&apos;re ready to launch your product to the world! 🚀</p>
      </TutorialStep>
    </ol>
  );
}
