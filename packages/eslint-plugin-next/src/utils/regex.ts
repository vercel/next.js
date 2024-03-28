export function isCapitalized(str: string): boolean {
  return /[A-Z]/.test(str?.[0])
}
