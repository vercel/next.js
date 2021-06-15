'use strict';

exports.__esModule = true;
exports.default = withRouter;

var _react = _interopRequireDefault(require('react'));

var _router = require('./router');

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : {
    default: obj
  };
}

function withRouter(ComposedComponent) {
  function WithRouterWrapper(props) {
    return /*#__PURE__*/_react.default.createElement(ComposedComponent, Object.assign({
      router: (0, _router.useRouter)()
    }, props));
  }

  WithRouterWrapper.getInitialProps = ComposedComponent.getInitialProps; // This is needed to allow checking for custom getInitialProps in _app

  WithRouterWrapper.origGetInitialProps = ComposedComponent.origGetInitialProps;

  if (process.env.NODE_ENV !== 'production') {
    const name = ComposedComponent.displayName || ComposedComponent.name || 'Unknown';
    WithRouterWrapper.displayName = `withRouter(${name})`;
  }

  return WithRouterWrapper;
}
//# sourceMappingURL=with-router.js.map