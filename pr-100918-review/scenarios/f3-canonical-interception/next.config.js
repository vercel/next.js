// Polling is only needed where FSEvents is unavailable (the Claude Code sandbox).
module.exports = { watchOptions: { pollIntervalMs: 500 } }
