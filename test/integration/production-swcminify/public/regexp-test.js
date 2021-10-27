// Note: this needs to be loaded via script tag
// or node_modules to test correctly otherwise babel
// will transform it properly and it's not longer
// testing the correct thing

var str1 = 'table football'
var regex1 = new RegExp('foo', 'y') // sticky
regex1.lastIndex = 6

window.isSticky = regex1.sticky // Expected: true
window.isMatch1 = regex1.test(str1) // Expected: true
window.isMatch2 = regex1.test(str1) // Expected: false
