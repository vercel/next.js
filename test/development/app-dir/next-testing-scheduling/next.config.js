module.exports = (phase) => {
  process.env.NEXT_SCHEDULING_COMPILER_PID = String(process.pid)
  process.env.NEXT_SCHEDULING_CONFIG_MODE =
    phase === 'phase-development-server' ? 'development' : 'production'
  return {}
}
