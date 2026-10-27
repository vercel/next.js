"use client";

import { activeTurn } from "eve/events";
import { useEveAgent } from "eve/react";
import { useState } from "react";

export function Chat() {
  const [input, setInput] = useState("");
  const agent = useEveAgent({ prewarm: input.length > 0 });

  const turnOpen = activeTurn(agent.view) !== undefined;
  const isResuming = agent.status === "resuming";
  const isThinking = turnOpen && agent.messages.at(-1)?.role === "user";

  return (
    <>
      <div className="messages">
        {agent.messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            {message.parts.map((part, index) => {
              switch (part.type) {
                case "text":
                  return <p key={part.id ?? index}>{part.text}</p>;
                case "tool":
                  return (
                    <p key={part.callId} className="tool">
                      {part.state === "completed" ? "Called" : "Calling"}{" "}
                      <code>{part.name}</code>
                    </p>
                  );
                default:
                  return null;
              }
            })}
          </div>
        ))}
        {isThinking ? (
          <div className="message assistant pending">Thinking…</div>
        ) : null}
        {agent.error ? (
          <div className="error" role="alert">
            {agent.error.message}
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const text = input.trim();
          if (text.length === 0 || isResuming) return;
          setInput("");
          void agent.send(text, turnOpen ? { turnPolicy: "steer" } : undefined);
        }}
      >
        <input
          aria-label="Message"
          autoFocus
          disabled={isResuming}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder="What's the weather in Paris?"
          value={input}
        />
        {turnOpen && input.trim().length === 0 ? (
          <button type="button" onClick={() => void agent.cancel()}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={isResuming}>
            Send
          </button>
        )}
        <button
          type="button"
          onClick={() => agent.newSession()}
          disabled={agent.messages.length === 0}
        >
          New chat
        </button>
      </form>
    </>
  );
}
