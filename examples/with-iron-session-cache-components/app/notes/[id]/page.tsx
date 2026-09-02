import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getNote } from "@/lib/data";

async function Note({
  params,
}: {
  params: PageProps<"/notes/[id]">["params"];
}) {
  const { id } = await params;
  // `getNote()` resolves the user from the session, so a guessed id cannot
  // reach another user's note.
  const note = await getNote(id);

  if (!note) {
    notFound();
  }

  return <article>{note.text}</article>;
}

export default function NotePage({ params }: PageProps<"/notes/[id]">) {
  return (
    <main>
      <Link href="/">← Back</Link>
      <Suspense fallback={<p>Loading note…</p>}>
        <Note params={params} />
      </Suspense>
    </main>
  );
}
