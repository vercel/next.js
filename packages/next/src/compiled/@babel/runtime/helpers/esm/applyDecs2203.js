import _typeof from "./typeof.js";
function applyDecs2203Factory() {
  function createAddInitializerMethod(initializers, decoratorFinishedRef) {
    return function (initializer) {
      !function (decoratorFinishedRef, fnName) {
        if (decoratorFinishedRef.v) throw new Error("attempted to call " + fnName + " after decoration was finished");
      }(decoratorFinishedRef, "addInitializer"), assertCallable(initializer, "An initializer"), initializers.push(initializer);
    };
  }
  function memberDec(dec, name, desc, initializers, kind, isStatic, isPrivate, value) {
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
    var get,
      set,
      ctx = {
        kind: kindStr,
        name: isPrivate ? "#" + name : name,
        "static": isStatic,
        "private": isPrivate
      },
      decoratorFinishedRef = {
        v: !1
      };
    0 !== kind && (ctx.addInitializer = createAddInitializerMethod(initializers, decoratorFinishedRef)), 0 === kind ? isPrivate ? (get = desc.get, set = desc.set) : (get = function get() {
      return this[name];
    }, set = function set(v) {
      this[name] = v;
    }) : 2 === kind ? get = function get() {
      return desc.value;
    } : (1 !== kind && 3 !== kind || (get = function get() {
      return desc.get.call(this);
    }), 1 !== kind && 4 !== kind || (set = function set(v) {
      desc.set.call(this, v);
    })), ctx.access = get && set ? {
      get: get,
      set: set
    } : get ? {
      get: get
    } : {
      set: set
    };
    try {
      return dec(value, ctx);
    } finally {
      decoratorFinishedRef.v = !0;
    }
  }
  function assertCallable(fn, hint) {
    if ("function" != typeof fn) throw new TypeError(hint + " must be a function");
  }
  function assertValidReturnValue(kind, value) {
    var type = _typeof(value);
    if (1 === kind) {
      if ("object" !== type || null === value) throw new TypeError("accessor decorators must return an object with get, set, or init properties or void 0");
      void 0 !== value.get && assertCallable(value.get, "accessor.get"), void 0 !== value.set && assertCallable(value.set, "accessor.set"), void 0 !== value.init && assertCallable(value.init, "accessor.init");
    } else if ("function" !== type) {
      var hint;
      throw hint = 0 === kind ? "field" : 10 === kind ? "class" : "method", new TypeError(hint + " decorators must return a function or void 0");
    }
  }
  function applyMemberDec(ret, base, decInfo, name, kind, isStatic, isPrivate, initializers) {
    var desc,
      init,
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
    } : 2 === kind ? value = desc.value : 3 === kind ? value = desc.get : 4 === kind && (value = desc.set), "function" == typeof decs) void 0 !== (newValue = memberDec(decs, name, desc, initializers, kind, isStatic, isPrivate, value)) && (assertValidReturnValue(kind, newValue), 0 === kind ? init = newValue : 1 === kind ? (init = newValue.init, get = newValue.get || value.get, set = newValue.set || value.set, value = {
      get: get,
      set: set
    }) : value = newValue);else for (var i = decs.length - 1; i >= 0; i--) {
      var newInit;
      if (void 0 !== (newValue = memberDec(decs[i], name, desc, initializers, kind, isStatic, isPrivate, value))) assertValidReturnValue(kind, newValue), 0 === kind ? newInit = newValue : 1 === kind ? (newInit = newValue.init, get = newValue.get || value.get, set = newValue.set || value.set, value = {
        get: get,
        set: set
      }) : value = newValue, void 0 !== newInit && (void 0 === init ? init = newInit : "function" == typeof init ? init = [init, newInit] : init.push(newInit));
    }
    if (0 === kind || 1 === kind) {
      if (void 0 === init) init = function init(instance, _init) {
        return _init;
      };else if ("function" != typeof init) {
        var ownInitializers = init;
        init = function init(instance, _init2) {
          for (var value = _init2, i = 0; i < ownInitializers.length; i++) value = ownInitializers[i].call(instance, value);
          return value;
        };
      } else {
        var originalInitializer = init;
        init = function init(instance, _init3) {
          return originalInitializer.call(instance, _init3);
        };
      }
      ret.push(init);
    }
    0 !== kind && (1 === kind ? (desc.get = value.get, desc.set = value.set) : 2 === kind ? desc.value = value : 3 === kind ? desc.get = value : 4 === kind && (desc.set = value), isPrivate ? 1 === kind ? (ret.push(function (instance, args) {
      return value.get.call(instance, args);
    }), ret.push(function (instance, args) {
      return value.set.call(instance, args);
    })) : 2 === kind ? ret.push(value) : ret.push(function (instance, args) {
      return value.call(instance, args);
    }) : Object.defineProperty(base, name, desc));
  }
  function pushInitializers(ret, initializers) {
    initializers && ret.push(function (instance) {
      for (var i = 0; i < initializers.length; i++) initializers[i].call(instance);
      return instance;
    });
  }
  return function (targetClass, memberDecs, classDecs) {
    var ret = [];
    return function (ret, Class, decInfos) {
      for (var protoInitializers, staticInitializers, existingProtoNonFields = new Map(), existingStaticNonFields = new Map(), i = 0; i < decInfos.length; i++) {
        var decInfo = decInfos[i];
        if (Array.isArray(decInfo)) {
          var base,
            initializers,
            kind = decInfo[1],
            name = decInfo[2],
            isPrivate = decInfo.length > 3,
            isStatic = kind >= 5;
          if (isStatic ? (base = Class, 0 != (kind -= 5) && (initializers = staticInitializers = staticInitializers || [])) : (base = Class.prototype, 0 !== kind && (initializers = protoInitializers = protoInitializers || [])), 0 !== kind && !isPrivate) {
            var existingNonFields = isStatic ? existingStaticNonFields : existingProtoNonFields,
              existingKind = existingNonFields.get(name) || 0;
            if (!0 === existingKind || 3 === existingKind && 4 !== kind || 4 === existingKind && 3 !== kind) throw new Error("Attempted to decorate a public method/accessor that has the same name as a previously decorated public method/accessor. This is not currently supported by the decorators plugin. Property name was: " + name);
            !existingKind && kind > 2 ? existingNonFields.set(name, kind) : existingNonFields.set(name, !0);
          }
          applyMemberDec(ret, base, decInfo, name, kind, isStatic, isPrivate, initializers);
        }
      }
      pushInitializers(ret, protoInitializers), pushInitializers(ret, staticInitializers);
    }(ret, targetClass, memberDecs), function (ret, targetClass, classDecs) {
      if (classDecs.length > 0) {
        for (var initializers = [], newClass = targetClass, name = targetClass.name, i = classDecs.length - 1; i >= 0; i--) {
          var decoratorFinishedRef = {
            v: !1
          };
          try {
            var nextNewClass = classDecs[i](newClass, {
              kind: "class",
              name: name,
              addInitializer: createAddInitializerMethod(initializers, decoratorFinishedRef)
            });
          } finally {
            decoratorFinishedRef.v = !0;
          }
          void 0 !== nextNewClass && (assertValidReturnValue(10, nextNewClass), newClass = nextNewClass);
        }
        ret.push(newClass, function () {
          for (var i = 0; i < initializers.length; i++) initializers[i].call(newClass);
        });
      }
    }(ret, targetClass, classDecs), ret;
  };
}
var applyDecs2203Impl;
export default function applyDecs2203(targetClass, memberDecs, classDecs) {
  return (applyDecs2203Impl = applyDecs2203Impl || applyDecs2203Factory())(targetClass, memberDecs, classDecs);
}