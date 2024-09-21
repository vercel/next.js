// This original console.error is for logging the error stack that doesn't
// need to deal any specific logic with the error overlay.
// NOTE: this module need to be unique to avoid duplicated override.

const originConsoleError = window.console.error

export { originConsoleError }
