"use client";

import { activeTurn } from "eve/events";
import { useEveAgent } from "eve/react";
import { useState } from "react";
import type { Row, TriageOutput } from "../agent/lib/triage";

export function Chat() {
  const [input, setInput] = useState("");
  const agent = useEveAgent({ prewarm: true });

  const turnOpen = activeTurn(agent.view) !== undefined;
  const isResuming = agent.status === "resuming";
  const isThinking = turnOpen && agent.messages.at(-1)?.role === "user";

  const send = (text: string) => {
    if (text.length === 0 || isResuming) return;
    setInput("");
    void agent.send(text, turnOpen ? { turnPolicy: "steer" } : undefined);
  };

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
                  if (part.name !== "triage_issues") return null;
                  return (
                    <TriageTable
                      key={part.callId}
                      output={part.output as TriageOutput | undefined}
                    />
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

      {agent.messages.length === 0 ? (
        <button
          type="button"
          className="suggestion"
          disabled={isResuming}
          onClick={() => send("Triage the open issues.")}
        >
          Triage the open issues
        </button>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(input.trim());
        }}
      >
        <input
          aria-label="Message"
          autoFocus
          disabled={isResuming}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder="Ask the agent to triage the issues"
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

const STATUS: Record<Row["status"], string> = {
  decided: "Decision model",
  reviewing: "Reviewing…",
  reviewed: "Reviewer",
  failed: "Review failed",
};

function TriageTable({ output }: { output: TriageOutput | undefined }) {
  if (!output) return <p className="tool">Deciding…</p>;
  return (
    <table className="triage">
      <thead>
        <tr>
          <th>Issue</th>
          <th>Category</th>
          <th>Priority</th>
          <th>Confidence</th>
          <th>Decided by</th>
        </tr>
      </thead>
      <tbody>
        {output.issues.map((row) => (
          <tr key={row.number} className={row.status}>
            <td>
              <strong>#{row.number}</strong> {row.title}
              {row.summary ? (
                <div className="summary">{row.summary}</div>
              ) : null}
            </td>
            <td>{row.category}</td>
            <td>{row.priority}</td>
            <td>{Math.round(row.confidence * 100)}%</td>
            <td>{STATUS[row.status]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
