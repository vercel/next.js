declare const TextEncoderConstructor: typeof TextEncoder
declare const TextDecoderConstructor: typeof TextDecoder


declare const atob: (encoded: string) => string
declare const btoa: (str: string) => string

export { TextDecoderConstructor as TextDecoder, TextEncoderConstructor as TextEncoder, atob, btoa };
