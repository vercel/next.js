import { TutorialStep } from "./tutorial-step";
import { CodeBlock } from "./code-block";

const create = `create table notes (
  id bigserial primary key generated always as identity,
  title text,
  created_at timestamp with time zone default now(),
  user_id uuid references auth.users(id) on delete cascade
);

-- Enable Row Level Security
alter table notes enable row level security;

-- Create policy to allow users to see only their own notes
create policy "Users can view their own notes" on notes
  for select using (auth.uid() = user_id);

-- Create policy to allow users to insert their own notes
create policy "Users can insert their own notes" on notes
  for insert with check (auth.uid() = user_id);

-- Create policy to allow users to update their own notes
create policy "Users can update their own notes" on notes
  for update using (auth.uid() = user_id);

-- Create policy to allow users to delete their own notes
create policy "Users can delete their own notes" on notes
  for delete using (auth.uid() = user_id);

-- Insert some sample data (using a placeholder UUID for demonstration)
insert into notes(title, user_id)
values
  ('Today I created a Supabase project.', '00000000-0000-0000-0000-000000000000'),
  ('I added some data and queried it from Next.js.', '00000000-0000-0000-0000-000000000000'),
  ('It was awesome!', '00000000-0000-0000-0000-000000000000');
`.trim();

const server = `import { createClient } from '@/lib/supabase/server'

export default async function Page() {
  const supabase = await createClient()
  
  // Get the current user safely
  const { data, error } = await supabase.auth.getUser()
  const user = data?.user || null
  
  if (error) {
    console.error('Error fetching user:', error.message)
    return <div>Error fetching user data.</div>
  }

  if (!user) {
    return <div>Please sign in to view your notes.</div>
  }
  
  // Query notes for the current user with error handling
  const { data: notes, error: notesError } = await supabase.from('notes').select()
  
  if (notesError) {
    console.error('Error fetching notes:', notesError.message)
    return <div>Error loading notes. Please try again later.</div>
  }

  return <pre>{JSON.stringify(notes, null, 2)}</pre>
}
`.trim();

const client = `'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function Page() {
  const [notes, setNotes] = useState<any[] | null>(null)
  const [user, setUser] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const getData = async () => {
      try {
        // Get the current user safely
        const { data, error } = await supabase.auth.getUser()
        const currentUser = data?.user || null
        setUser(currentUser)
        
        if (error) {
          console.error('Error fetching user:', error.message)
          setError('Error fetching user data.')
          return
        }

        if (currentUser) {
          // Query notes for the current user with error handling
          const { data: fetchedNotes, error: notesError } = await supabase.from('notes').select()
          
          if (notesError) {
            console.error('Error fetching notes:', notesError.message)
            setError('Error loading notes. Please try again later.')
            return
          }
          
          setNotes(fetchedNotes)
        }
      } catch (err) {
        console.error('Unexpected error:', err)
        setError('An unexpected error occurred. Please try again.')
      }
    }
    getData()
  }, [])

  if (error) {
    return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>
  }

  if (!user) {
    return <div>Please sign in to view your notes.</div>
  }

  return <pre>{JSON.stringify(notes, null, 2)}</pre>
}
`.trim();

export function FetchDataSteps() {
  return (
    <ol className="flex flex-col gap-6">
      <TutorialStep title="Create some tables and insert some data">
        <p>
          Head over to the{" "}
          <a
            href="https://supabase.com/dashboard/project/_/editor"
            className="font-bold hover:underline text-foreground/80"
            target="_blank"
            rel="noreferrer"
          >
            Table Editor
          </a>{" "}
          for your Supabase project to create a table and insert some example
          data. If you&apos;re stuck for creativity, you can copy and paste the
          following into the{" "}
          <a
            href="https://supabase.com/dashboard/project/_/sql/new"
            className="font-bold hover:underline text-foreground/80"
            target="_blank"
            rel="noreferrer"
          >
            SQL Editor
          </a>{" "}
          and click RUN!
        </p>
        <CodeBlock code={create} />
      </TutorialStep>

      <TutorialStep title="Query Supabase data from Next.js">
        <p>
          To create a Supabase client and query data from an Async Server
          Component, create a new page.tsx file at{" "}
          <span className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs font-medium text-secondary-foreground border">
            /app/notes/page.tsx
          </span>{" "}
          and add the following.
        </p>
        <CodeBlock code={server} />
        <p>Alternatively, you can use a Client Component.</p>
        <CodeBlock code={client} />
      </TutorialStep>

      <TutorialStep title="Explore the Supabase UI Library">
        <p>
          Head over to the{" "}
          <a
            href="https://supabase.com/ui"
            className="font-bold hover:underline text-foreground/80"
          >
            Supabase UI library
          </a>{" "}
          and try installing some blocks. For example, you can install a
          Realtime Chat block by running:
        </p>
        <CodeBlock
          code={
            "npx shadcn@latest add https://supabase.com/ui/r/realtime-chat-nextjs.json"
          }
        />
      </TutorialStep>

      <TutorialStep title="Build in a weekend and scale to millions!">
        <p>You&apos;re ready to launch your product to the world! 🚀</p>
      </TutorialStep>
    </ol>
  );
}
