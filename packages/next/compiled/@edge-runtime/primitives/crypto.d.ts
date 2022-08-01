export const crypto: Crypto

declare const CryptoConstructor: typeof Crypto
declare const CryptoKeyConstructor: typeof CryptoKey
declare const SubtleCryptoConstructor: typeof SubtleCrypto

export { CryptoConstructor as Crypto }
export { CryptoKeyConstructor as CryptoKey }
export { SubtleCryptoConstructor as SubtleCrypto }
