# Eval Tests

Each subdirectory contains a test case with:

- `PROMPT.md` — the prompt to invoke the skill
- `EVAL.md` — the expected output

## Running

Create a team of agents to run all test cases in parallel — one agent per subdirectory. Each agent should:

1. Execute the skill workflow for the prompt in `PROMPT.md`
2. Diff the generated `release-*.txt` against `EVAL.md` — they should match
