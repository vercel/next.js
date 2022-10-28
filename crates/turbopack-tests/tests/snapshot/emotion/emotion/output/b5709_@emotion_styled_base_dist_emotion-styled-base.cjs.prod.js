(self.TURBOPACK = self.TURBOPACK || []).push(["output/b5709_@emotion_styled_base_dist_emotion-styled-base.cjs.prod.js", {

"[project]/node_modules/.pnpm/@emotion+styled@11.10.4_hn2242ymjfeigbcxwpi42fjy6u/node_modules/@emotion/styled/base/dist/emotion-styled-base.cjs.prod.js (ecmascript)": (function({ r: __turbopack_require__, x: __turbopack_external_require__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, c: __turbopack_cache__, l: __turbopack_load__, p: process, __dirname, m: module, e: exports }) { !function() {

'use strict';
Object.defineProperty(exports, '__esModule', {
    value: true
});
var _extends = __turbopack_require__("[project]/node_modules/.pnpm/@babel+runtime@7.18.9/node_modules/@babel/runtime/helpers/extends.js (ecmascript)");
var React = __turbopack_require__("[project]/node_modules/.pnpm/react@18.2.0/node_modules/react/index.js (ecmascript)");
var isPropValid = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+is-prop-valid@1.2.0/node_modules/@emotion/is-prop-valid/dist/emotion-is-prop-valid.cjs.js (ecmascript)");
var react = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+react@11.10.4_b6k74wvxdvqypha4emuv7fd2ke/node_modules/@emotion/react/dist/emotion-react.cjs.js (ecmascript)");
var utils = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+utils@1.2.0/node_modules/@emotion/utils/dist/emotion-utils.cjs.js (ecmascript)");
var serialize = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+serialize@1.1.0/node_modules/@emotion/serialize/dist/emotion-serialize.cjs.js (ecmascript)");
var useInsertionEffectWithFallbacks = __turbopack_require__("[project]/node_modules/.pnpm/@emotion+use-insertion-effect-with-fallbacks@1.0.0_react@18.2.0/node_modules/@emotion/use-insertion-effect-with-fallbacks/dist/emotion-use-insertion-effect-with-fallbacks.cjs.js (ecmascript)");
function _interopDefault(e) {
    return e && e.__esModule ? e : {
        'default': e
    };
}
var isPropValid__default = _interopDefault(isPropValid);
var testOmitPropsOnStringTag = isPropValid__default['default'];
var testOmitPropsOnComponent = function testOmitPropsOnComponent(key) {
    return key !== 'theme';
};
var getDefaultShouldForwardProp = function getDefaultShouldForwardProp(tag) {
    return typeof tag === 'string' && tag.charCodeAt(0) > 96 ? testOmitPropsOnStringTag : testOmitPropsOnComponent;
};
var composeShouldForwardProps = function composeShouldForwardProps(tag, options, isReal) {
    var shouldForwardProp;
    if (options) {
        var optionsShouldForwardProp = options.shouldForwardProp;
        shouldForwardProp = tag.__emotion_forwardProp && optionsShouldForwardProp ? function(propName) {
            return tag.__emotion_forwardProp(propName) && optionsShouldForwardProp(propName);
        } : optionsShouldForwardProp;
    }
    if (typeof shouldForwardProp !== 'function' && isReal) {
        shouldForwardProp = tag.__emotion_forwardProp;
    }
    return shouldForwardProp;
};
var isBrowser = typeof document !== 'undefined';
var Insertion = function Insertion(_ref) {
    var cache = _ref.cache, serialized = _ref.serialized, isStringTag = _ref.isStringTag;
    utils.registerStyles(cache, serialized, isStringTag);
    var rules = useInsertionEffectWithFallbacks.useInsertionEffectAlwaysWithSyncFallback(function() {
        return utils.insertStyles(cache, serialized, isStringTag);
    });
    if (!isBrowser && rules !== undefined) {
        var _ref2;
        var serializedNames = serialized.name;
        var next = serialized.next;
        while(next !== undefined){
            serializedNames += ' ' + next.name;
            next = next.next;
        }
        return React.createElement("style", (_ref2 = {}, _ref2["data-emotion"] = cache.key + " " + serializedNames, _ref2.dangerouslySetInnerHTML = {
            __html: rules
        }, _ref2.nonce = cache.sheet.nonce, _ref2));
    }
    return null;
};
var createStyled = function createStyled(tag, options) {
    var isReal = tag.__emotion_real === tag;
    var baseTag = isReal && tag.__emotion_base || tag;
    var identifierName;
    var targetClassName;
    if (options !== undefined) {
        identifierName = options.label;
        targetClassName = options.target;
    }
    var shouldForwardProp = composeShouldForwardProps(tag, options, isReal);
    var defaultShouldForwardProp = shouldForwardProp || getDefaultShouldForwardProp(baseTag);
    var shouldUseAs = !defaultShouldForwardProp('as');
    return function() {
        var args = arguments;
        var styles = isReal && tag.__emotion_styles !== undefined ? tag.__emotion_styles.slice(0) : [];
        if (identifierName !== undefined) {
            styles.push("label:" + identifierName + ";");
        }
        if (args[0] == null || args[0].raw === undefined) {
            styles.push.apply(styles, args);
        } else {
            styles.push(args[0][0]);
            var len = args.length;
            var i = 1;
            for(; i < len; i++){
                styles.push(args[i], args[0][i]);
            }
        }
        var Styled = react.withEmotionCache(function(props, cache, ref) {
            var FinalTag = shouldUseAs && props.as || baseTag;
            var className = '';
            var classInterpolations = [];
            var mergedProps = props;
            if (props.theme == null) {
                mergedProps = {};
                for(var key in props){
                    mergedProps[key] = props[key];
                }
                mergedProps.theme = React.useContext(react.ThemeContext);
            }
            if (typeof props.className === 'string') {
                className = utils.getRegisteredStyles(cache.registered, classInterpolations, props.className);
            } else if (props.className != null) {
                className = props.className + " ";
            }
            var serialized = serialize.serializeStyles(styles.concat(classInterpolations), cache.registered, mergedProps);
            className += cache.key + "-" + serialized.name;
            if (targetClassName !== undefined) {
                className += " " + targetClassName;
            }
            var finalShouldForwardProp = shouldUseAs && shouldForwardProp === undefined ? getDefaultShouldForwardProp(FinalTag) : defaultShouldForwardProp;
            var newProps = {};
            for(var _key in props){
                if (shouldUseAs && _key === 'as') continue;
                if (finalShouldForwardProp(_key)) {
                    newProps[_key] = props[_key];
                }
            }
            newProps.className = className;
            newProps.ref = ref;
            return React.createElement(React.Fragment, null, React.createElement(Insertion, {
                cache: cache,
                serialized: serialized,
                isStringTag: typeof FinalTag === 'string'
            }), React.createElement(FinalTag, newProps));
        });
        Styled.displayName = identifierName !== undefined ? identifierName : "Styled(" + (typeof baseTag === 'string' ? baseTag : baseTag.displayName || baseTag.name || 'Component') + ")";
        Styled.defaultProps = tag.defaultProps;
        Styled.__emotion_real = Styled;
        Styled.__emotion_base = baseTag;
        Styled.__emotion_styles = styles;
        Styled.__emotion_forwardProp = shouldForwardProp;
        Object.defineProperty(Styled, 'toString', {
            value: function value() {
                if (targetClassName === undefined && "production" !== 'production') {
                    return 'NO_COMPONENT_SELECTOR';
                }
                return "." + targetClassName;
            }
        });
        Styled.withComponent = function(nextTag, nextOptions) {
            return createStyled(nextTag, _extends({}, options, nextOptions, {
                shouldForwardProp: composeShouldForwardProps(Styled, nextOptions, true)
            })).apply(void 0, styles);
        };
        return Styled;
    };
};
exports.default = createStyled;

}.call(this) }),
}]);


//# sourceMappingURL=b5709_@emotion_styled_base_dist_emotion-styled-base.cjs.prod.js.a92a1b3c17dde217.map