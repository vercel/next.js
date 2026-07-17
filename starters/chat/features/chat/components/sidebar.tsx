import Link from "next/link";
import { getConversations } from "@/features/chat/chat-queries";

export async function Sidebar() {
  const conversations = await getConversations();

  return (
    <nav className="flex flex-col gap-1">
      <Link
        href="/"
        className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-foreground/5"
      >
        New chat
      </Link>
      {conversations.map((conversation) => (
        <Link
          key={conversation.id}
          href={`/chat/${conversation.id}`}
          className="truncate rounded-lg px-3 py-2 text-sm text-foreground/70 hover:bg-foreground/5"
        >
          {conversation.title}
        </Link>
      ))}
    </nav>
  );
}

export function SidebarSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-9 items-center px-3">
          <div className="h-3.5 w-full animate-pulse rounded bg-foreground/10" />
        </div>
      ))}
    </div>
  );
}
