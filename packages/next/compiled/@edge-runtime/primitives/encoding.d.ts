declare const TextEncoderConstructor: typeof TextEncoder
declare const TextDecoderConstructor: typeof TextDecoder

export { TextEncoderConstructor as TextEncoder }
export { TextDecoderConstructor as TextDecoder }

export const atob: (encoded: string) => string
export const btoa: (str: string) => string
