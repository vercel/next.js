import { Suspense } from "react";
import {
  Conversation,
  ConversationSkeleton,
} from "@/features/chat/components/conversation";
import { getConversation } from "@/features/chat/chat-queries";

export const prefetch = "allow-runtime";

export default function ChatPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <Suspense fallback={<ConversationSkeleton />}>
      {params.then(async ({ id }) => {
        const conversation = await getConversation(id);
        return (
          <Conversation
            id={conversation.id}
            initialMessages={conversation.messages}
          />
        );
      })}
    </Suspense>
  );
}
