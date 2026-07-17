import Link from "next/link";

export default function ConversationNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold">Conversation not found</h1>
      <p className="text-sm text-foreground/70">It may have been removed.</p>
      <Link href="/" className="mt-4 text-sm underline">
        Start a new chat
      </Link>
    </div>
  );
}
