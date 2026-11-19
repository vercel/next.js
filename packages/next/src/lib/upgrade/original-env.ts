// Records the environment the user launched the CLI with, before `bin/next`
// applies its own defaults (`NODE_ENV`, `NEXT_RUNTIME`, ...) and before `.env`
// files are loaded. Agent upgrade handoffs must start the coding agent from
// this environment, not from the one Next.js prepared for its own process.
//
// TODO(#101989): Not implemented yet. The fix captures `process.env` here, is
// called first thing in `bin/next`, and `runUpgrade` restores it before the
// handoff. Calling it again replaces the previous capture.
export function captureOriginalEnv(): void {}
