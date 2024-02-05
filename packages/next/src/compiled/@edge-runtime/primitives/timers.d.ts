declare const _setTimeout: (callback: () => void, ms?: number) => number
declare const _setInterval: (callback: () => void, ms?: number) => number

export { _setInterval as setInterval, _setTimeout as setTimeout };
