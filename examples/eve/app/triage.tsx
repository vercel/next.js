"use client";

import { activeTurn } from "eve/events";
import { useEveAgent } from "eve/react";
import type { Issue, Row, TriageOutput } from "../agent/lib/triage";

const STATUS: Record<Row["status"], string> = {
  decided: "Decision model",
  reviewing: "Reviewing…",
  reviewed: "Reviewer",
  failed: "Review failed",
};

export function Triage({ issues }: { issues: Issue[] }) {
  const agent = useEveAgent({ prewarm: true });

  const running =
    agent.status === "busy" || activeTurn(agent.view) !== undefined;
  const isResuming = agent.status === "resuming";

  // Show the latest run: its triage_issues call and the agent's summary after it.
  const lastRun = agent.messages.findLastIndex(
    (message) => message.role === "user",
  );
  const parts = agent.messages
    .slice(lastRun + 1)
    .flatMap((message) => message.parts);
  const call = parts.findLast(
    (part) => part.type === "tool" && part.name === "triage_issues",
  );
  const output =
    call?.type === "tool"
      ? (call.output as TriageOutput | undefined)
      : undefined;
  const summary = parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

  return (
    <>
      <div className="actions">
        {running ? (
          <button
            type="button"
            className="secondary"
            onClick={() => void agent.cancel()}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            disabled={isResuming}
            onClick={() => void agent.send("Triage the open issues.")}
          >
            {lastRun === -1 ? "Triage issues" : "Triage again"}
          </button>
        )}
      </div>

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
          {issues.map((issue) => {
            const row = output?.issues.find(
              ({ number }) => number === issue.number,
            );
            return (
              <tr key={issue.number} className={row?.status}>
                <td>
                  <strong>#{issue.number}</strong> {issue.title}
                  <div className="body">{issue.body}</div>
                  {row?.summary ? (
                    <div className="summary">Reviewer: {row.summary}</div>
                  ) : null}
                </td>
                <td>{row?.category ?? "–"}</td>
                <td>{row?.priority ?? "–"}</td>
                <td>{row ? `${Math.round(row.confidence * 100)}%` : "–"}</td>
                <td>
                  {row ? STATUS[row.status] : running ? "Deciding…" : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {summary ? <p className="result">{summary}</p> : null}

      {agent.error ? (
        <div className="error" role="alert">
          {agent.error.message}
        </div>
      ) : null}
    </>
  );
}
