module.exports = function (source) {
  this.callback(null, source, {
    version: 3,
    sources: ['original-page.scss'],
    sourcesContent: [source],
    names: [],
    // Zero-based CSS -> SCSS positions: 0:0 -> 0:0, 1:2 -> 0:2, 2:0 -> 1:0.
    mappings: 'AAAA;EAAE;AACF',
  })
}
