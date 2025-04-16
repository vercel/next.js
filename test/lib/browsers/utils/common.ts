import rawConsole from 'node:console'

export const maxBrowserCleanupDuration = 10_000
export const maxCleanupDuration = 5_000

export const isDebuggingPlaywright = !!process.env.NEXT_TEST_DEBUG_PLAYWRIGHT

export const debugConsole = isDebuggingPlaywright ? rawConsole : null
