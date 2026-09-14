import * as ciEnvironment from '../server/ci-info'

/**
 * OSC 9;4 terminal progress reporting for `next build`.
 *
 * The build has no single unit of "total work", so we model it as a fixed set
 * of weighted stages, each owning a band of the overall 0-100% range. Stages
 * that expose a real count (collecting page data, static generation) fill their
 * band from that count; stages that don't (compiling, type checking) ease
 * toward their band end over time so the bar keeps visibly moving. This is
 * deliberately heuristic — the goal is "roughly right and always moving", not
 * byte-accurate progress.
 *
 * The OSC 9;4 sequence (`ESC ] 9 ; 4 ; <state> ; <progress> BEL`) is rendered
 * as an OS taskbar / terminal-tab progress bar by terminals that support it
 * (Windows Terminal, ConEmu, WezTerm, Ghostty, foot, Rio). Terminals that don't
 * support it ignore the sequence silently, so it is safe to emit on any TTY.
 */

export type BuildProgressStage =
  | 'setup'
  | 'compile'
  | 'type-check'
  | 'collect-page-data'
  | 'static-generation'
  | 'finalize'

interface Band {
  start: number
  end: number
}

/**
 * Fixed bands applied in pipeline order. Stages that don't run in a given build
 * (compile-only / generate-only mode, no app dir, zero export paths) simply
 * leave the bar wherever it was; the next stage that starts advances it to its
 * band start.
 */
const BANDS: Record<BuildProgressStage, Band> = {
  setup: { start: 0, end: 3 },
  compile: { start: 3, end: 62 },
  'type-check': { start: 62, end: 74 },
  'collect-page-data': { start: 74, end: 88 },
  'static-generation': { start: 88, end: 99 },
  finalize: { start: 99, end: 100 },
}

/** OSC 9;4 progress states we use. */
const enum OscState {
  Clear = 0,
  Normal = 1,
  Error = 2,
}

/** How often the easing timer ticks, in milliseconds. */
const EASE_INTERVAL_MS = 250

/**
 * Easing factor per tick. On each tick the current position moves this fraction
 * of the remaining distance to the band end, so it approaches but never reaches
 * the end until the stage completes and snaps it there.
 */
const EASE_FACTOR = 0.06

export interface BuildProgressBar {
  /** Enter a stage. Starts easing for stages without a real count. */
  startStage(stage: BuildProgressStage): void
  /** Fill a counted stage's band from `done`/`total`. */
  setStageFraction(stage: BuildProgressStage, done: number, total: number): void
  /** Leave a stage, snapping the bar to the band end. */
  completeStage(stage: BuildProgressStage): void
  /** Mark the build complete: fill to 100%, then clear the bar. */
  finish(): void
  /** Mark the build as failed: show the error state, then clear the bar. */
  fail(): void
}

/** A progress bar that does nothing, used when reporting is disabled. */
const noopBuildProgressBar: BuildProgressBar = {
  startStage() {},
  setStageFraction() {},
  completeStage() {},
  finish() {},
  fail() {},
}

function writeOsc(state: OscState, progress: number): void {
  // Clamp to the 0-100 integer range OSC 9;4 expects.
  const pct = Math.max(0, Math.min(100, Math.round(progress)))
  process.stdout.write(`\x1b]9;4;${state};${pct}\x07`)
}

/**
 * Create a build progress bar. Returns a no-op implementation (with the same
 * shape, so call sites need no conditionals) when reporting is disabled:
 * non-TTY output, CI environments, or when `NEXT_DISABLE_BUILD_PROGRESS` is set.
 */
export function createBuildProgressBar(): BuildProgressBar {
  if (
    !process.stdout.isTTY ||
    ciEnvironment.isCI ||
    process.env.NEXT_DISABLE_BUILD_PROGRESS
  ) {
    return noopBuildProgressBar
  }

  // The last integer percent we emitted, so we only write on change (OSC
  // progress is an integer, so this is natural throttling).
  let lastEmitted = -1
  // The current fractional position of the bar (0-100).
  let current = 0
  let easeTimer: ReturnType<typeof setInterval> | undefined
  let cleanedUp = false

  const emit = (state: OscState, progress: number): void => {
    const pct = Math.round(progress)
    if (state === OscState.Normal && pct === lastEmitted) {
      return
    }
    lastEmitted = pct
    writeOsc(state, progress)
  }

  const advanceTo = (progress: number): void => {
    // Never move the bar backwards.
    if (progress <= current) {
      return
    }
    current = progress
    emit(OscState.Normal, current)
  }

  const stopEasing = (): void => {
    if (easeTimer) {
      clearInterval(easeTimer)
      easeTimer = undefined
    }
  }

  const clear = (): void => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true
    stopEasing()
    writeOsc(OscState.Clear, 0)
    process.removeListener('exit', onExit)
    process.removeListener('SIGINT', onSigint)
  }

  // Ensure an interrupted or crashed build never leaves a stuck taskbar bar.
  const onExit = (): void => clear()
  const onSigint = (): void => clear()
  process.on('exit', onExit)
  process.on('SIGINT', onSigint)

  return {
    startStage(stage) {
      const band = BANDS[stage]
      stopEasing()
      advanceTo(band.start)

      // Counted stages fill their band from setStageFraction instead of easing.
      if (stage === 'collect-page-data' || stage === 'static-generation') {
        return
      }

      easeTimer = setInterval(() => {
        // Asymptotically approach the band end without reaching it; the stage's
        // completeStage snaps to the end.
        advanceTo(current + (band.end - current) * EASE_FACTOR)
      }, EASE_INTERVAL_MS)
      // Don't keep the process alive just for the progress timer.
      easeTimer.unref?.()
    },

    setStageFraction(stage, done, total) {
      const band = BANDS[stage]
      if (total <= 0) {
        return
      }
      const fraction = Math.max(0, Math.min(1, done / total))
      advanceTo(band.start + (band.end - band.start) * fraction)
    },

    completeStage(stage) {
      stopEasing()
      advanceTo(BANDS[stage].end)
    },

    finish() {
      stopEasing()
      current = 100
      emit(OscState.Normal, 100)
      clear()
    },

    fail() {
      stopEasing()
      emit(OscState.Error, current)
      clear()
    },
  }
}
