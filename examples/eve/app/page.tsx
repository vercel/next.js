import { Chat } from "./chat";

export default function Page() {
  return (
    <main>
      <h1>Next.js + eve</h1>
      <p className="subtitle">
        Ask about the weather. The agent lives in <code>agent/</code> and is
        served from <code>/eve/v1/*</code> on this origin.
      </p>
      <Chat />
    </main>
  );
}
