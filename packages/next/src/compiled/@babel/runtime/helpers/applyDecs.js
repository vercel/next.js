var _typeof = require("./typeof.js")["default"];
function old_createMetadataMethodsForProperty(metadataMap, kind, property, decoratorFinishedRef) {
  return {
    getMetadata: function getMetadata(key) {
      old_assertNotFinished(decoratorFinishedRef, "getMetadata"), old_assertMetadataKey(key);
      var metadataForKey = metadataMap[key];
      if (void 0 !== metadataForKey) if (1 === kind) {
        var pub = metadataForKey["public"];
        if (void 0 !== pub) return pub[property];
      } else if (2 === kind) {
        var priv = metadataForKey["private"];
        if (void 0 !== priv) return priv.get(property);
      } else if (Object.hasOwnProperty.call(metadataForKey, "constructor")) return metadataForKey.constructor;
    },
    setMetadata: function setMetadata(key, value) {
      old_assertNotFinished(decoratorFinishedRef, "setMetadata"), old_assertMetadataKey(key);
      var metadataForKey = metadataMap[key];
      if (void 0 === metadataForKey && (metadataForKey = metadataMap[key] = {}), 1 === kind) {
        var pub = metadataForKey["public"];
        void 0 === pub && (pub = metadataForKey["public"] = {}), pub[property] = value;
      } else if (2 === kind) {
        var priv = metadataForKey.priv;
        void 0 === priv && (priv = metadataForKey["private"] = new Map()), priv.set(property, value);
      } else metadataForKey.constructor = value;
    }
  };
}
function old_convertMetadataMapToFinal(obj, metadataMap) {
  var parentMetadataMap = obj[Symbol.metadata || Symbol["for"]("Symbol.metadata")],
    metadataKeys = Object.getOwnPropertySymbols(metadataMap);
  if (0 !== metadataKeys.length) {
    for (var i = 0; i < metadataKeys.length; i++) {
      var key = metadataKeys[i],
        metaForKey = metadataMap[key],
        parentMetaForKey = parentMetadataMap ? parentMetadataMap[key] : null,
        pub = metaForKey["public"],
        parentPub = parentMetaForKey ? parentMetaForKey["public"] : null;
      pub && parentPub && Object.setPrototypeOf(pub, parentPub);
      var priv = metaForKey["private"];
      if (priv) {
        var privArr = Array.from(priv.values()),
          parentPriv = parentMetaForKey ? parentMetaForKey["private"] : null;
        parentPriv && (privArr = privArr.concat(parentPriv)), metaForKey["private"] = privArr;
      }
      parentMetaForKey && Object.setPrototypeOf(metaForKey, parentMetaForKey);
    }
    parentMetadataMap && Object.setPrototypeOf(metadataMap, parentMetadataMap), obj[Symbol.metadata || Symbol["for"]("Symbol.metadata")] = metadataMap;
  }
}
function old_createAddInitializerMethod(initializers, decoratorFinishedRef) {
  return function (initializer) {
    old_assertNotFinished(decoratorFinishedRef, "addInitializer"), old_assertCallable(initializer, "An initializer"), initializers.push(initializer);
  };
}
function old_memberDec(dec, name, desc, metadataMap, initializers, kind, isStatic, isPrivate, value) {
  var kindStr;
  switch (kind) {
    case 1:
      kindStr = "accessor";
      break;
    case 2:
      kindStr = "method";
      break;
    case 3:
      kindStr = "getter";
      break;
    case 4:
      kindStr = "setter";
      break;
    default:
      kindStr = "field";
  }
  var metadataKind,
    metadataName,
    ctx = {
      kind: kindStr,
      name: isPrivate ? "#" + name : name,
      isStatic: isStatic,
      isPrivate: isPrivate
    },
    decoratorFinishedRef = {
      v: !1
    };
  if (0 !== kind && (ctx.addInitializer = old_createAddInitializerMethod(initializers, decoratorFinishedRef)), isPrivate) {
    metadataKind = 2, metadataName = Symbol(name);
    var access = {};
    0 === kind ? (access.get = desc.get, access.set = desc.set) : 2 === kind ? access.get = function () {
      return desc.value;
    } : (1 !== kind && 3 !== kind || (access.get = function () {
      return desc.get.call(this);
    }), 1 !== kind && 4 !== kind || (access.set = function (v) {
      desc.set.call(this, v);
    })), ctx.access = access;
  } else metadataKind = 1, metadataName = name;
  try {
    return dec(value, Object.assign(ctx, old_createMetadataMethodsForProperty(metadataMap, metadataKind, metadataName, decoratorFinishedRef)));
  } finally {
    decoratorFinishedRef.v = !0;
  }
}
function old_assertNotFinished(decoratorFinishedRef, fnName) {
  if (decoratorFinishedRef.v) throw new Error("attempted to call " + fnName + " after decoration was finished");
}
function old_assertMetadataKey(key) {
  if ("symbol" != _typeof(key)) throw new TypeError("Metadata keys must be symbols, received: " + key);
}
function old_assertCallable(fn, hint) {
  if ("function" != typeof fn) throw new TypeError(hint + " must be a function");
}
function old_assertValidReturnValue(kind, value) {
  var type = _typeof(value);
  if (1 === kind) {
    if ("object" !== type || null === value) throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0");
    void 0 !== value.get && old_assertCallable(value.get, "accessor.get"), void 0 !== value.set && old_assertCallable(value.set, "accessor.set"), void 0 !== value.init && old_assertCallable(value.init, "accessor.init"), void 0 !== value.initializer && old_assertCallable(value.initializer, "accessor.initializer");
  } else if ("function" !== type) {
    var hint;
    throw hint = 0 === kind ? "field" : 10 === kind ? "class" : "method", new TypeError(hint + " decorators must return a function or void 0");
  }
}
function old_getInit(desc) {
  var initializer;
  return null == (initializer = desc.init) && (initializer = desc.initializer) && "undefined" != typeof console && console.warn(".initializer has been renamed to .init as of March 2022"), initializer;
}
function old_applyMemberDec(ret, base, decInfo, name, kind, isStatic, isPrivate, metadataMap, initializers) {
  var desc,
    initializer,
    value,
    newValue,
    get,
    set,
    decs = decInfo[0];
  if (isPrivate ? desc = 0 === kind || 1 === kind ? {
    get: decInfo[3],
    set: decInfo[4]
  } : 3 === kind ? {
    get: decInfo[3]
  } : 4 === kind ? {
    set: decInfo[3]
  } : {
    value: decInfo[3]
  } : 0 !== kind && (desc = Object.getOwnPropertyDescriptor(base, name)), 1 === kind ? value = {
    get: desc.get,
    set: desc.set
  } : 2 === kind ? value = desc.value : 3 === kind ? value = desc.get : 4 === kind && (value = desc.set), "function" == typeof decs) void 0 !== (newValue = old_memberDec(decs, name, desc, metadataMap, initializers, kind, isStatic, isPrivate, value)) && (old_assertValidReturnValue(kind, newValue), 0 === kind ? initializer = newValue : 1 === kind ? (initializer = old_getInit(newValue), get = newValue.get || value.get, set = newValue.set || value.set, value = {
    get: get,
    set: set
  }) : value = newValue);else for (var i = decs.length - 1; i >= 0; i--) {
    var newInit;
    if (void 0 !== (newValue = old_memberDec(decs[i], name, desc, metadataMap, initializers, kind, isStatic, isPrivate, value))) old_assertValidReturnValue(kind, newValue), 0 === kind ? newInit = newValue : 1 === kind ? (newInit = old_getInit(newValue), get = newValue.get || value.get, set = newValue.set || value.set, value = {
      get: get,
      set: set
    }) : value = newValue, void 0 !== newInit && (void 0 === initializer ? initializer = newInit : "function" == typeof initializer ? initializer = [initializer, newInit] : initializer.push(newInit));
  }
  if (0 === kind || 1 === kind) {
    if (void 0 === initializer) initializer = function initializer(instance, init) {
      return init;
    };else if ("function" != typeof initializer) {
      var ownInitializers = initializer;
      initializer = function initializer(instance, init) {
        for (var value = init, i = 0; i < ownInitializers.length; i++) value = ownInitializers[i].call(instance, value);
        return value;
      };
    } else {
      var originalInitializer = initializer;
      initializer = function initializer(instance, init) {
        return originalInitializer.call(instance, init);
      };
    }
    ret.push(initializer);
  }
  0 !== kind && (1 === kind ? (desc.get = value.get, desc.set = value.set) : 2 === kind ? desc.value = value : 3 === kind ? desc.get = value : 4 === kind && (desc.set = value), isPrivate ? 1 === kind ? (ret.push(function (instance, args) {
    return value.get.call(instance, args);
  }), ret.push(function (instance, args) {
    return value.set.call(instance, args);
  })) : 2 === kind ? ret.push(value) : ret.push(function (instance, args) {
    return value.call(instance, args);
  }) : Object.defineProperty(base, name, desc));
}
function old_applyMemberDecs(ret, Class, protoMetadataMap, staticMetadataMap, decInfos) {
  for (var protoInitializers, staticInitializers, existingProtoNonFields = new Map(), existingStaticNonFields = new Map(), i = 0; i < decInfos.length; i++) {
    var decInfo = decInfos[i];
    if (Array.isArray(decInfo)) {
      var base,
        metadataMap,
        initializers,
        kind = decInfo[1],
        name = decInfo[2],
        isPrivate = decInfo.length > 3,
        isStatic = kind >= 5;
      if (isStatic ? (base = Class, metadataMap = staticMetadataMap, 0 !== (kind -= 5) && (initializers = staticInitializers = staticInitializers || [])) : (base = Class.prototype, metadataMap = protoMetadataMap, 0 !== kind && (initializers = protoInitializers = protoInitializers || [])), 0 !== kind && !isPrivate) {
        var existingNonFields = isStatic ? existingStaticNonFields : existingProtoNonFields,
          existingKind = existingNonFields.get(name) || 0;
        if (!0 === existingKind || 3 === existingKind && 4 !== kind || 4 === existingKind && 3 !== kind) throw new Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: " + name);
        !existingKind && kind > 2 ? existingNonFields.set(name, kind) : existingNonFields.set(name, !0);
      }
      old_applyMemberDec(ret, base, decInfo, name, kind, isStatic, isPrivate, metadataMap, initializers);
    }
  }
  old_pushInitializers(ret, protoInitializers), old_pushInitializers(ret, staticInitializers);
}
function old_pushInitializers(ret, initializers) {
  initializers && ret.push(function (instance) {
    for (var i = 0; i < initializers.length; i++) initializers[i].call(instance);
    return instance;
  });
}
function old_applyClassDecs(ret, targetClass, metadataMap, classDecs) {
  if (classDecs.length > 0) {
    for (var initializers = [], newClass = targetClass, name = targetClass.name, i = classDecs.length - 1; i >= 0; i--) {
      var decoratorFinishedRef = {
        v: !1
      };
      try {
        var ctx = Object.assign({
            kind: "class",
            name: name,
            addInitializer: old_createAddInitializerMethod(initializers, decoratorFinishedRef)
          }, old_createMetadataMethodsForProperty(metadataMap, 0, name, decoratorFinishedRef)),
          nextNewClass = classDecs[i](newClass, ctx);
      } finally {
        decoratorFinishedRef.v = !0;
      }
      void 0 !== nextNewClass && (old_assertValidReturnValue(10, nextNewClass), newClass = nextNewClass);
    }
    ret.push(newClass, function () {
      for (var i = 0; i < initializers.length; i++) initializers[i].call(newClass);
    });
  }
}
function applyDecs(targetClass, memberDecs, classDecs) {
  var ret = [],
    staticMetadataMap = {},
    protoMetadataMap = {};
  return old_applyMemberDecs(ret, targetClass, protoMetadataMap, staticMetadataMap, memberDecs), old_convertMetadataMapToFinal(targetClass.prototype, protoMetadataMap), old_applyClassDecs(ret, targetClass, staticMetadataMap, classDecs), old_convertMetadataMapToFinal(targetClass, staticMetadataMap), ret;
}
module.exports = applyDecs, module.exports.__esModule = true, module.exports["default"] = module.exports;