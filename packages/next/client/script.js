"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.handleClientScriptLoad = handleClientScriptLoad;
exports.initScriptLoader = initScriptLoader;
exports.default = void 0;
var _extends = require("@swc/helpers/lib/_extends.js").default;
var _interop_require_wildcard = require("@swc/helpers/lib/_interop_require_wildcard.js").default;
var _object_without_properties_loose = require("@swc/helpers/lib/_object_without_properties_loose.js").default;
var _react = _interop_require_wildcard(require("react"));
var _headManagerContext = require("../shared/lib/head-manager-context");
var _headManager = require("./head-manager");
var _requestIdleCallback = require("./request-idle-callback");
const ScriptCache = new Map();
const LoadCache = new Set();
const ignoreProps = [
    'onLoad',
    'onReady',
    'dangerouslySetInnerHTML',
    'children',
    'onError',
    'strategy', 
];
const loadScript = (props)=>{
    const { src , id , onLoad =()=>{} , onReady =null , dangerouslySetInnerHTML , children ='' , strategy ='afterInteractive' , onError ,  } = props;
    const cacheKey = id || src;
    // Script has already loaded
    if (cacheKey && LoadCache.has(cacheKey)) {
        return;
    }
    // Contents of this script are already loading/loaded
    if (ScriptCache.has(src)) {
        LoadCache.add(cacheKey);
        // It is possible that multiple `next/script` components all have same "src", but has different "onLoad"
        // This is to make sure the same remote script will only load once, but "onLoad" are executed in order
        ScriptCache.get(src).then(onLoad, onError);
        return;
    }
    /** Execute after the script first loaded */ const afterLoad = ()=>{
        // Run onReady for the first time after load event
        if (onReady) {
            onReady();
        }
        // add cacheKey to LoadCache when load successfully
        LoadCache.add(cacheKey);
    };
    const el = document.createElement('script');
    const loadPromise = new Promise((resolve, reject)=>{
        el.addEventListener('load', function(e) {
            resolve();
            if (onLoad) {
                onLoad.call(this, e);
            }
            afterLoad();
        });
        el.addEventListener('error', function(e) {
            reject(e);
        });
    }).catch(function(e) {
        if (onError) {
            onError(e);
        }
    });
    if (dangerouslySetInnerHTML) {
        el.innerHTML = dangerouslySetInnerHTML.__html || '';
        afterLoad();
    } else if (children) {
        el.textContent = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : '';
        afterLoad();
    } else if (src) {
        el.src = src;
        // do not add cacheKey into LoadCache for remote script here
        // cacheKey will be added to LoadCache when it is actually loaded (see loadPromise above)
        ScriptCache.set(src, loadPromise);
    }
    for (const [k, value] of Object.entries(props)){
        if (value === undefined || ignoreProps.includes(k)) {
            continue;
        }
        const attr = _headManager.DOMAttributeNames[k] || k.toLowerCase();
        el.setAttribute(attr, value);
    }
    if (strategy === 'worker') {
        el.setAttribute('type', 'text/partytown');
    }
    el.setAttribute('data-nscript', strategy);
    document.body.appendChild(el);
};
function handleClientScriptLoad(props) {
    const { strategy ='afterInteractive'  } = props;
    if (strategy === 'lazyOnload') {
        window.addEventListener('load', ()=>{
            (0, _requestIdleCallback).requestIdleCallback(()=>loadScript(props));
        });
    } else {
        loadScript(props);
    }
}
function loadLazyScript(props) {
    if (document.readyState === 'complete') {
        (0, _requestIdleCallback).requestIdleCallback(()=>loadScript(props));
    } else {
        window.addEventListener('load', ()=>{
            (0, _requestIdleCallback).requestIdleCallback(()=>loadScript(props));
        });
    }
}
function addBeforeInteractiveToCache() {
    const scripts = [
        ...document.querySelectorAll('[data-nscript="beforeInteractive"]'),
        ...document.querySelectorAll('[data-nscript="beforePageRender"]'), 
    ];
    scripts.forEach((script)=>{
        const cacheKey = script.id || script.getAttribute('src');
        LoadCache.add(cacheKey);
    });
}
function initScriptLoader(scriptLoaderItems) {
    scriptLoaderItems.forEach(handleClientScriptLoad);
    addBeforeInteractiveToCache();
}
function Script(props) {
    const { id , src ='' , onLoad =()=>{} , onReady =null , strategy ='afterInteractive' , onError  } = props, restProps = _object_without_properties_loose(props, [
        "id",
        "src",
        "onLoad",
        "onReady",
        "strategy",
        "onError"
    ]);
    // Context is available only during SSR
    const { updateScripts , scripts , getIsSsr  } = (0, _react).useContext(_headManagerContext.HeadManagerContext);
    /**
   * - First mount:
   *   1. The useEffect for onReady executes
   *   2. hasOnReadyEffectCalled.current is false, but the script hasn't loaded yet (not in LoadCache)
   *      onReady is skipped, set hasOnReadyEffectCalled.current to true
   *   3. The useEffect for loadScript executes
   *   4. hasLoadScriptEffectCalled.current is false, loadScript executes
   *      Once the script is loaded, the onLoad and onReady will be called by then
   *   [If strict mode is enabled / is wrapped in <OffScreen /> component]
   *   5. The useEffect for onReady executes again
   *   6. hasOnReadyEffectCalled.current is true, so entire effect is skipped
   *   7. The useEffect for loadScript executes again
   *   8. hasLoadScriptEffectCalled.current is true, so entire effect is skipped
   *
   * - Second mount:
   *   1. The useEffect for onReady executes
   *   2. hasOnReadyEffectCalled.current is false, but the script has already loaded (found in LoadCache)
   *      onReady is called, set hasOnReadyEffectCalled.current to true
   *   3. The useEffect for loadScript executes
   *   4. The script is already loaded, loadScript bails out
   *   [If strict mode is enabled / is wrapped in <OffScreen /> component]
   *   5. The useEffect for onReady executes again
   *   6. hasOnReadyEffectCalled.current is true, so entire effect is skipped
   *   7. The useEffect for loadScript executes again
   *   8. hasLoadScriptEffectCalled.current is true, so entire effect is skipped
   */ const hasOnReadyEffectCalled = (0, _react).useRef(false);
    (0, _react).useEffect(()=>{
        const cacheKey = id || src;
        if (!hasOnReadyEffectCalled.current) {
            // Run onReady if script has loaded before but component is re-mounted
            if (onReady && cacheKey && LoadCache.has(cacheKey)) {
                onReady();
            }
            hasOnReadyEffectCalled.current = true;
        }
    }, [
        onReady,
        id,
        src
    ]);
    const hasLoadScriptEffectCalled = (0, _react).useRef(false);
    (0, _react).useEffect(()=>{
        if (!hasLoadScriptEffectCalled.current) {
            if (strategy === 'afterInteractive') {
                loadScript(props);
            } else if (strategy === 'lazyOnload') {
                loadLazyScript(props);
            }
            hasLoadScriptEffectCalled.current = true;
        }
    }, [
        props,
        strategy
    ]);
    if (strategy === 'beforeInteractive' || strategy === 'worker') {
        if (updateScripts) {
            scripts[strategy] = (scripts[strategy] || []).concat([
                _extends({
                    id,
                    src,
                    onLoad,
                    onReady,
                    onError
                }, restProps), 
            ]);
            updateScripts(scripts);
        } else if (getIsSsr && getIsSsr()) {
            // Script has already loaded during SSR
            LoadCache.add(id || src);
        } else if (getIsSsr && !getIsSsr()) {
            loadScript(props);
        }
    }
    return null;
}
Object.defineProperty(Script, '__nextScript', {
    value: true
});
var _default = Script;
exports.default = _default;

//# sourceMappingURL=script.js.mapunction' || (typeof exports.default === 'object' && exports.default !== null)) && typeof exports.default.__esModule === 'undefined') {
  Object.defineProperty(exports.default, '__esModule', { value: true });
  Object.assign(exports.default, exports);
  module.exports = exports.default;
}

//# sourceMappingURL=script.js.mapupdateScripts(scripts);
        } else if (getIsSsr && getIsSsr()) {
            // Script has already loaded during SSR
            LoadCache.add(id || src);
        } else if (getIsSsr && !getIsSsr()) {
            loadScript(props);
        }
    }
    return null;
}
Object.defineProperty(Script, "__nextScript", {
    value: true
});
var _default = Script;
exports.default = _default;

//# sourceMappingURL=script.js.map