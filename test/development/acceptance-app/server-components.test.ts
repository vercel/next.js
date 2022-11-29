/* eslint-env jest */
import { sandbox } from './helpers'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import path from 'path'

// TODO-APP: improve these errors
describe('Error Overlay for server components', () => {
  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }

  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
      },
      skipStart: true,
    })
  })
  afterAll(() => next.destroy())

  test('should show error when React.createContext is called', async () => {
    const { session, browser, cleanup } = await sandbox(
      next,
      new Map([
        [
          'node_modules/my-package/index.js',
          `
          const react = require('react')
          module.exports = react.createContext()
        `,
        ],
        [
          'node_modules/my-package/package.json',
          `
          {
            "name": "my-package",
            "version": "0.0.1"
          }
        `,
        ],
        [
          'app/page.js',
          `
        import Context from 'my-package'
        export default function Page() {
          return (
            <>
                <Context.Provider value="hello">
                    <h1>Page</h1>
                </Context.Provider>
            </>
          )
        }`,
        ],
      ])
    )

    // TODO-APP: currently requires a full reload because moving from a client component to a server component isn't causing a Fast Refresh yet.
    await browser.refresh()

    expect(await session.hasRedbox(true)).toBe(true)
    expect(await session.getRedboxSource(true)).toMatchSnapshot()

    await cleanup()
  })

  test('should show error when class component is called', async () => {
    const { session, browser, cleanup } = await sandbox(
      next,
      new Map([
        [
          'app/class-component.js',
          `
          import React from 'react'
          export default class Comp extends React.Component {
            render() {
                return <h1>Class Component</h1>
            }
          }
        `,
        ],
        [
          'app/page.js',
          `
        import Comp from './class-component'
        export default function Page() {
          return (
            <>
                <Comp />
            </>
          )
        }`,
        ],
      ])
    )

    // TODO-APP: currently requires a full reload because moving from a client component to a server component isn't causing a Fast Refresh yet.
    await browser.refresh()

    expect(await session.hasRedbox(true)).toBe(true)
    expect(await session.getRedboxSource(true)).toMatchSnapshot()

    await cleanup()
  })

  test('should show error when class component is called from npm package', async () => {
    const { session, browser, cleanup } = await sandbox(
      next,
      new Map([
        [
          'node_modules/my-package/index.js',
          /*
          Code below is the compiled output from Babel for the following code:
          import React from 'react'
          export default class Comp extends React.Component {
            render() {
                return <h1>Class Component</h1>
            }
          }
          */
          `
          "use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _react = _interopRequireDefault(require("react"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); Object.defineProperty(subClass, "prototype", { writable: false }); if (superClass) _setPrototypeOf(subClass, superClass); }
function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }
function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }
function _possibleConstructorReturn(self, call) { if (call && (typeof call === "object" || typeof call === "function")) { return call; } else if (call !== void 0) { throw new TypeError("Derived constructors may only return object or undefined"); } return _assertThisInitialized(self); }
function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }
function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }
var Comp = /*#__PURE__*/function (_React$Component) {
  _inherits(Comp, _React$Component);
  var _super = _createSuper(Comp);
  function Comp() {
    _classCallCheck(this, Comp);
    return _super.apply(this, arguments);
  }
  _createClass(Comp, [{
    key: "render",
    value: function render() {
      return /*#__PURE__*/_react.default.createElement("h1", null, "Hello World!");
    }
  }]);
  return Comp;
}(_react.default.Component);
exports.default = Comp;
        `,
        ],
        [
          'node_modules/my-package/package.json',
          `
          {
            "name": "my-package",
            "version": "0.0.1"
          }
        `,
        ],
        [
          'app/page.js',
          `
        import Comp from 'my-package'
        export default function Page() {
          return (
            <>
                <Comp />
            </>
          )
        }`,
        ],
      ])
    )

    // TODO-APP: currently requires a full reload because moving from a client component to a server component isn't causing a Fast Refresh yet.
    await browser.refresh()

    expect(await session.hasRedbox(true)).toBe(true)
    expect(await session.getRedboxSource(true)).toMatchSnapshot()

    await cleanup()
  })
})
