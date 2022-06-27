'use strict'
Object.defineProperty(exports, '__esModule', {
  value: true,
})
exports.default = OuterLayoutRouter
exports.InnerLayoutRouter = InnerLayoutRouter
var _react = _interopRequireWildcard(require('react'))
var _appRouterContext = require('../../shared/lib/app-router-context')
var _appRouterClient = require('./app-router.client')
function OuterLayoutRouter({
  parallelRouterKey,
  segmentPath,
  childProp,
  loading,
}) {
  const { childNodes, tree, url } = (0, _react).useContext(
    _appRouterContext.AppTreeContext
  )
  if (!childNodes[parallelRouterKey]) {
    childNodes[parallelRouterKey] = new Map()
  }
  var ref
  // This relates to the segments in the current router
  // tree[1].children[0] refers to tree.children.segment in the data format
  const currentChildSegment =
    (ref = tree[1][parallelRouterKey][0]) !== null && ref !== void 0
      ? ref
      : childProp.segment
  const preservedSegments = [currentChildSegment]
  return /*#__PURE__*/ _react.default.createElement(
    _react.default.Fragment,
    null,
    preservedSegments.map((preservedSegment) => {
      return /*#__PURE__*/ _react.default.createElement(
        LoadingBoundary,
        {
          loading: loading,
          key: preservedSegment,
        },
        /*#__PURE__*/ _react.default.createElement(InnerLayoutRouter, {
          parallelRouterKey: parallelRouterKey,
          url: url,
          tree: tree,
          childNodes: childNodes[parallelRouterKey],
          childProp: childProp.segment === preservedSegment ? childProp : null,
          segmentPath: segmentPath,
          path: preservedSegment,
          isActive: currentChildSegment === preservedSegment,
        })
      )
    })
  )
}
function _interopRequireWildcard(obj) {
  if (obj && obj.__esModule) {
    return obj
  } else {
    var newObj = {}
    if (obj != null) {
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          var desc =
            Object.defineProperty && Object.getOwnPropertyDescriptor
              ? Object.getOwnPropertyDescriptor(obj, key)
              : {}
          if (desc.get || desc.set) {
            Object.defineProperty(newObj, key, desc)
          } else {
            newObj[key] = obj[key]
          }
        }
      }
    }
    newObj.default = obj
    return newObj
  }
}
let infinitePromise
function InnerLayoutRouter({
  parallelRouterKey,
  url,
  childNodes,
  childProp,
  segmentPath: segmentPath1,
  tree: tree1, // isActive,
  path,
}) {
  const { changeByServerResponse, tree: fullTree } = (0, _react).useContext(
    _appRouterContext.FullAppTreeContext
  )
  if (childProp && !childNodes.has(path)) {
    childNodes.set(path, {
      subTreeData: childProp.current,
      parallelRoutes: {
        [parallelRouterKey]: new Map(),
      },
    })
    childProp.current = null
  }
  if (!childNodes.has(path)) {
    console.log('KICKING OFF DATA FETCH IN RENDER', {
      path,
      childNodes: new Map(childNodes),
      fullTree,
    })
    const data = (0, _appRouterClient).fetchServerResponse(
      new URL(url, location.origin),
      segmentPath1
    )
    childNodes.set(path, {
      data,
      subTreeData: null,
      parallelRoutes: {
        [parallelRouterKey]: new Map(),
      },
    })
  }
  const childNode = childNodes.get(path)
  if (childNode.data) {
    // TODO: error case
    const root = childNode.data.readRoot()
    console.log('ROOT', root)
    const matchesTree = (tree, segmentPath) => {
      // Segment matches
      if (segmentPath[0] === tree[0]) {
        // Both don't have further segments
        if (!segmentPath[1] && !tree[1]) {
          return {
            matches: true,
          }
        }
        // tree has further segments but segment doesn't
        if (!segmentPath[1]) {
          return {
            matches: false,
          }
        }
        // Both have further segments and parallel router key matches
        if (segmentPath[1] && tree[1] && segmentPath[1][0] === tree[1][0]) {
          // segmentPath has further segments
          if (segmentPath[1][1]) {
            return matchesTree(tree[1][1], segmentPath[1][1])
          }
        }
      }
      return {
        matches: false,
      }
    }
    // Handle case where the response might be for this subrouter
    if (root.length === 1) {
      const matches = matchesTree(root[0], segmentPath1)
      // layoutpath === with the tree from the server
      // happy path and the childNodes would be seeded and data set to null
      if (matches) {
        // childNode.data = null
        // childNode.subTreeData = root[0].
        // childNode.childNodes = new Map()
      }
      console.log(matches)
    } else {
      // For push we can set data in the cache
      // layoutpath is deeper than the tree from the server
      // const currentData = childNode.data
      // childNode.data = null
      // keep recursing down the tree until it matches
      // deeperNode.data = currentData
      // copy the the cache upward back to where the childNode was
      // childNode.childNodes = clonedCache
      // layoutpath does not match the tree from the server
      // See code below that handles this case at the root
      childNode.data = null
      // TODO: if the tree did not match up do we provide the new tree here?
      setTimeout(() => {
        // @ts-ignore TODO: startTransition exists
        _react.default.startTransition(() => {
          // TODO: handle redirect
          changeByServerResponse(fullTree, root)
        })
      })
    }
    // Suspend infinitely as `changeByServerResponse` will cause a different part of the tree to be rendered.
    if (!infinitePromise) infinitePromise = new Promise(() => {})
    throw infinitePromise
  }
  // TODO: double check users can't return null in a component that will kick in here
  if (!childNode.subTreeData) {
    if (!infinitePromise) infinitePromise = new Promise(() => {})
    throw infinitePromise
  }
  var ref
  return /*#__PURE__*/ _react.default.createElement(
    _appRouterContext.AppTreeContext.Provider,
    {
      value: {
        tree: tree1[1][parallelRouterKey],
        childNodes: childNode.parallelRoutes,
        url: (ref = tree1[2]) !== null && ref !== void 0 ? ref : url,
      },
    },
    childNode.subTreeData
  )
}
function LoadingBoundary({ children, loading }) {
  if (loading) {
    return /*#__PURE__*/ _react.default.createElement(
      _react.default.Suspense,
      {
        fallback: loading,
      },
      children
    )
  }
  return /*#__PURE__*/ _react.default.createElement(
    _react.default.Fragment,
    null,
    children
  )
}

//# sourceMappingURL=layout-router.client.js.map
