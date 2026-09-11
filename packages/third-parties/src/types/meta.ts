/* The `declare global` block in TypeScript is used to extend the global scope with custom types or
interfaces. In this specific case: */
declare global {
  interface Window {
    fbq: (type: string, name: string, options?: any) => void
  }
}

export type FBPixelProps = {
  pixelId: string
  pixelScriptUrl?: string
  nonce?: string
}
