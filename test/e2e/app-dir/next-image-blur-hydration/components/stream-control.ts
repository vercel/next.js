export const streamControl = globalThis as typeof globalThis & {
  releaseImageStream?: () => void
}
