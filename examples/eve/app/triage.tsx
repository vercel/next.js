"use client";

import { activeTurn } from "eve/events";
import { useEveAgent } from "eve/react";
import { useEffect, useState } from "react";
import {
  CONFIDENCE_THRESHOLD,
  type Issue,
  type Row,
  type TriageOutput,
} from "../agent/lib/triage";
import styles from "./triage.module.css";

const PROMPT = "Triage the open issues.";

type Phase = "idle" | "running" | "done";
type StageState = "pending" | "active" | "done";

const PIPELINE = [
  { label: "Load issues", kind: "code", detail: "step" },
  { label: "Decision model", kind: "model", detail: "every issue" },
  { label: "Reviewer subagent", kind: "model", detail: "only if unsure" },
] as const;

function LogEntry({
  index,
  kind,
  children,
}: {
  index: number;
  kind: "step" | "model" | "agent";
  children: React.ReactNode;
}) {
  return (
    <li>
      <span className={styles.entryIndex}>
        {String(index).padStart(2, "0")}
      </span>
      <span className={`${styles.entryKind} ${styles[kind]}`}>{kind}</span>
      <span className={styles.entryText}>{children}</span>
    </li>
  );
}

function TileStatus({
  state,
  row,
}: {
  state: Row["status"] | "deciding" | "idle";
  row: Row | undefined;
}) {
  const confidence = row ? `${Math.round(row.confidence * 100)}%` : "";
  switch (state) {
    case "deciding":
      return (
        <span className={styles.tileStatus}>
          <span className={styles.spinner} aria-hidden />
          Deciding
        </span>
      );
    case "reviewing":
      return (
        <span className={styles.tileStatus}>
          <span className={styles.spinner} aria-hidden />
          Reviewer
          <span className={styles.amber}>{confidence}</span>
        </span>
      );
    case "decided":
    case "reviewed":
      return (
        <span className={styles.tileStatus}>
          <span className={styles.dot} aria-hidden />
          {state === "decided" ? "Decision" : "Reviewer"}
          <span
            className={
              row && row.confidence < CONFIDENCE_THRESHOLD
                ? styles.amber
                : styles.white
            }
          >
            {confidence}
          </span>
        </span>
      );
    case "failed":
      return (
        <span className={`${styles.tileStatus} ${styles.red}`}>No answer</span>
      );
    default:
      return null;
  }
}

function IssueTile({
  issue,
  row,
  phase,
}: {
  issue: Issue;
  row: Row | undefined;
  phase: Phase;
}) {
  const state = row?.status ?? (phase === "running" ? "deciding" : "idle");
  const escalated = row !== undefined && row.confidence < CONFIDENCE_THRESHOLD;
  return (
    <div
      className={`${styles.tile} ${styles[`tile_${state}`]} ${escalated ? styles.escalated : ""}`}
    >
      <div className={styles.tileTop}>
        <span className={styles.tileNumber}>#{issue.number}</span>
        <TileStatus state={state} row={row} />
      </div>
      <p className={styles.tileTitle}>{issue.title}</p>
      <p className={styles.tileBody}>{row?.summary ?? issue.body}</p>
      <div className={styles.tileBottom}>
        {row ? (
          <span className={styles.finding}>
            <span>{row.category}</span>
            <span className={row.priority === "high" ? styles.amber : ""}>
              {row.priority}
            </span>
          </span>
        ) : null}
      </div>
      {row ? (
        // Decision confidence along the bottom edge, with a tick at the threshold.
        <span className={styles.confidence} aria-hidden>
          <span
            className={styles.confidenceFill}
            style={{
              transform: `scaleX(${row.confidence})`,
              background: escalated ? "var(--amber)" : "var(--white)",
            }}
          />
          <span
            className={styles.confidenceMark}
            style={{ left: `${CONFIDENCE_THRESHOLD * 100}%` }}
          />
        </span>
      ) : null}
    </div>
  );
}

function activityLabel(phase: Phase, output: TriageOutput | undefined) {
  if (phase === "done") return "Done";
  if (!output) return "Deciding every issue";
  const reviewing = output.issues.filter(
    (row) => row.status === "reviewing",
  ).length;
  return reviewing > 0
    ? `Reviewing ${reviewing} unsure ${reviewing === 1 ? "issue" : "issues"}`
    : "Summarizing";
}

/** Time since the run started, frozen when it ends. */
function useElapsed(phase: Phase) {
  const [startedAt, setStartedAt] = useState<number>();
  const [now, setNow] = useState<number>();

  useEffect(() => {
    if (phase === "idle") setStartedAt(undefined);
    if (phase !== "running") return;
    const start = Date.now();
    setStartedAt((at) => at ?? start);
    setNow(start);
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [phase]);

  return startedAt === undefined || now === undefined
    ? undefined
    : Math.max(0, now - startedAt);
}

export function Triage({ issues }: { issues: Issue[] }) {
  const agent = useEveAgent({ prewarm: true });
  const running =
    agent.status === "busy" || activeTurn(agent.view) !== undefined;
  const started = agent.messages.some((message) => message.role === "user");
  const phase: Phase = running ? "running" : started ? "done" : "idle";

  const parts = agent.messages.flatMap((message) => message.parts);
  const call = parts.findLast(
    (part) => part.type === "tool" && part.name === "triage_issues",
  );
  const output =
    call?.type === "tool"
      ? (call.output as TriageOutput | undefined)
      : undefined;
  const reply = agent.messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();

  const rows = new Map(output?.issues.map((row) => [row.number, row]));
  const unsure = output?.issues.filter(
    (row) => row.confidence < CONFIDENCE_THRESHOLD,
  );
  const elapsed = useElapsed(phase);

  const stages: StageState[] =
    phase === "idle"
      ? ["pending", "pending", "pending"]
      : phase === "done"
        ? ["done", "done", "done"]
        : !output
          ? ["done", "active", "pending"]
          : output.issues.some((row) => row.status === "reviewing")
            ? ["done", "done", "active"]
            : ["done", "done", "done"];

  return (
    <div className={styles.console}>
      <div className={styles.pipeline}>
        {PIPELINE.map((stage, index) => (
          <div key={stage.label} className={styles.stageWrap}>
            {index > 0 ? (
              <span
                className={`${styles.connector} ${stages[index] !== "pending" ? styles.connectorOn : ""}`}
              />
            ) : null}
            <span className={`${styles.stage} ${styles[stages[index]]}`}>
              <span className={styles.stageKind}>{stage.kind}</span>
              <span className={styles.stageLabel}>{stage.label}</span>
              <span className={styles.stageDetail}>{stage.detail}</span>
            </span>
          </div>
        ))}
      </div>

      <div className={styles.main}>
        <div className={styles.panel}>
          {phase === "idle" ? (
            <div className={styles.promptCard}>
              <p className={styles.kicker}>Prompt</p>
              <p className={styles.promptText}>{PROMPT}</p>
              <button
                type="button"
                className={styles.runButton}
                disabled={agent.status === "resuming"}
                onClick={() => void agent.send(PROMPT)}
              >
                Run triage
              </button>
            </div>
          ) : (
            <>
              <div className={styles.log}>
                <p className={styles.userText}>{PROMPT}</p>
                <ol className={styles.entries}>
                  <LogEntry index={1} kind="step">
                    Load issues · {issues.length} issues
                  </LogEntry>
                  {unsure ? (
                    <LogEntry index={2} kind="model">
                      Decision model · {issues.length - unsure.length}{" "}
                      confident, {unsure.length} unsure
                    </LogEntry>
                  ) : null}
                  {unsure?.map((row, index) => (
                    <LogEntry key={row.number} index={3 + index} kind="agent">
                      Reviewer · #{row.number}
                    </LogEntry>
                  ))}
                </ol>
                {reply ? <p className={styles.reply}>{reply}</p> : null}
                {agent.error ? (
                  <p className={styles.error}>{agent.error.message}</p>
                ) : null}
              </div>
              <div className={styles.footer}>
                <span className={styles.activity}>
                  {phase === "running" ? (
                    <span className={styles.spinner} aria-hidden />
                  ) : (
                    <span className={styles.dot} aria-hidden />
                  )}
                  {activityLabel(phase, output)}
                  {elapsed !== undefined ? (
                    <span className={styles.elapsed}>
                      {(elapsed / 1000).toFixed(1)}s
                    </span>
                  ) : null}
                </span>
                {phase === "running" ? (
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => void agent.cancel()}
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => agent.newSession()}
                  >
                    Reset
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className={styles.grid}>
          {issues.map((issue) => (
            <IssueTile
              key={issue.number}
              issue={issue}
              row={rows.get(issue.number)}
              phase={phase}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
