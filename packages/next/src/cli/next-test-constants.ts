/**
 * Constants for next test command
 *
 * These are separated from next-test.ts to avoid loading heavy dependencies
 * (like loadConfig, verifyTypeScriptSetup) when only the constants are needed.
 */

export const SUPPORTED_TEST_RUNNERS_LIST = ['playwright'] as const
export type SupportedTestRunners = (typeof SUPPORTED_TEST_RUNNERS_LIST)[number]
