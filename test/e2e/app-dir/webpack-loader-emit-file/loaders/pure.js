module.exports = function () {
  const { outputPath } = this.getOptions()
  this.emitFile(`${outputPath}/pure.txt`, 'retained-after-tree-shaking')
  return `
    export const value = 'pure-value';
    export function unused() { return 'unused-export-marker'; }
  `
}
