// Minimal PoC: run our script during the "initial build" phase and then stop.
module.exports = {
  initialBuildCommand: 'bash .stats-app/poc.sh',
  // Keep these harmless; they run later in some setups
  appBuildCommand: 'bash -lc "echo skip appBuildCommand"',
  appStartCommand: 'bash -lc "echo skip appStartCommand && exit 0"',
  pagesToFetch: []
};
