import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getNote } from "@/lib/data";

// This route depends on both the session cookie and the `id` param. Cookies are
// already in the App Shell; `allow-runtime` also resolves the param at prefetch
// time, so the note is ready before the click instead of streaming in after it.
export const prefetch = "allow-runtime";

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

async function Note({
  params,
}: {
  params: PageProps<"/notes/[id]">["params"];
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const note = await getNote(user.id, id);

  if (!note) {
    notFound();
  }

  return <article>{note.text}</article>;
}
