export const NEXT_CODEMOD_ERROR_PREFIX = '@next-codemod-error'
export const NEXT_CODEMOD_IGNORE_ERROR_PREFIX = '@next-codemod-ignore'

export function migrationError(reason: string): string {
  const text = reason.trim()
  return text.startsWith(NEXT_CODEMOD_ERROR_PREFIX)
    ? text
    : `${NEXT_CODEMOD_ERROR_PREFIX} ${text}`
}
