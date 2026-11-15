import { decide } from "eve/ai";
import { DECISION_MODEL, type Decision, type Issue } from "./triage";

/**
 * Decides every issue in one step: no conversation and no tools, just typed
 * choices with probabilities. A replayed workflow reuses the recorded answers.
 */
export async function decideIssues(
  issues: Issue[],
  signal?: AbortSignal,
): Promise<Decision[]> {
  "use step";
  // No probabilities means no confidence, so the issue goes to the reviewer.
  const top = (probabilities?: Record<string, number>) =>
    probabilities ? Math.max(...Object.values(probabilities)) : 0;

  return Promise.all(
    issues.map(async (issue) => {
      const { answers } = await decide({
        model: DECISION_MODEL,
        signal,
        state: { title: issue.title, body: issue.body },
        questions: {
          category: {
            type: "choice",
            instructions: "What kind of issue is this?",
            criteria: {
              bug: "Something is broken or behaves incorrectly",
              feature: "A request for new capability",
              docs: "Documentation is missing or wrong",
              maintenance: "Tests, refactors, dependencies, or chores",
            },
          },
          priority: {
            type: "choice",
            instructions: "How urgent is it for users?",
            criteria: {
              high: "Breaks users or blocks work now",
              normal: "Should be fixed in the normal course of work",
              low: "Minor or nice to have",
            },
          },
        },
      });
      return {
        category: answers.category.choice,
        priority: answers.priority.choice,
        confidence: Math.min(
          top(answers.category.probabilities),
          top(answers.priority.probabilities),
        ),
      };
    }),
  );
}
