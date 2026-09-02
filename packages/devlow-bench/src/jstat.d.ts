// Minimal ambient declarations for `jstat` (no TypeScript types shipped).
// Only the distribution CDFs used by src/statistics.ts are declared.
declare module 'jstat' {
  const jstat: {
    studentt: { cdf(x: number, dof: number): number }
    normal: { cdf(x: number, mean: number, sd: number): number }
  }
  export default jstat
}
