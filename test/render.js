
import test from 'ava'
import React from 'react'
import { render } from '../server/render'

test('Render a basic component', async t => {
  const html = await render('./fixtures/basic-stateless', null, null, { test: true })
  t.is(html, '<!DOCTYPE html><html><head><style data-aphrodite="true"></style></head><body><div><div id="__next"><h1 data-reactroot="" data-reactid="1" data-react-checksum="711070432">My component!</h1></div><script>__NEXT_DATA__ = {"component":"\'use strict\';\\n\\nObject.defineProperty(exports, \\"__esModule\\", {\\n  value: true\\n});\\n\\nvar _react = require(\'react\');\\n\\nvar _react2 = _interopRequireDefault(_react);\\n\\nfunction _interopRequireDefault(obj) { return obj \\u0026\\u0026 obj.__esModule ? obj : { default: obj }; }\\n\\nexports.default = function () {\\n  return _react2.default.createElement(\\n    \'h1\',\\n    null,\\n    \'My component!\'\\n  );\\n};","classNames":[]}</script></div><script type="text/javascript" src="/_next/next.bundle.js"></script></body></html>')
})

test('Render a basic component with css', async t => {
  const html = await render('./fixtures/basic-css', null, null, { test: true })
  t.is(html, '<!DOCTYPE html><html><head><style data-aphrodite="true">.red_im3wl1{color:red !important;}</style></head><body><div><div id="__next"><div class="red_im3wl1" data-reactroot="" data-reactid="1" data-react-checksum="-317187657">This is red</div></div><script>__NEXT_DATA__ = {"component":"\'use strict\';\\n\\nObject.defineProperty(exports, \\"__esModule\\", {\\n  value: true\\n});\\n\\nvar _react = require(\'react\');\\n\\nvar _react2 = _interopRequireDefault(_react);\\n\\nvar _css = require(\'../../lib/css\');\\n\\nfunction _interopRequireDefault(obj) { return obj \\u0026\\u0026 obj.__esModule ? obj : { default: obj }; }\\n\\nexports.default = function () {\\n  return _react2.default.createElement(\\n    \'div\',\\n    { className: (0, _css.css)(styles.red) },\\n    \'This is red\'\\n  );\\n};\\n\\nvar styles = _css.StyleSheet.create({\\n  red: { color: \'red\' }\\n});","classNames":["red_im3wl1"]}</script></div><script type="text/javascript" src="/_next/next.bundle.js"></script></body></html>')
})
