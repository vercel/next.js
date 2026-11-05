module.exports = function transform(css, element) {
  element.textContent = '/* transformed */\n' + css
}
