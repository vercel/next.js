import OverloadYield from "./OverloadYield.js";
export default function AsyncGenerator(gen) {
  var front, back;
  function resume(key, arg) {
    try {
      var result = gen[key](arg),
        value = result.value,
        overloaded = value instanceof OverloadYield;
      Promise.resolve(overloaded ? value.v : value).then(function (arg) {
        if (overloaded) {
          var nextKey = "return" === key ? "return" : "next";
          if (!value.k || arg.done) return resume(nextKey, arg);
          arg = gen[nextKey](arg).value;
        }
        settle(result.done ? "return" : "normal", arg);
      }, function (err) {
        resume("throw", err);
      });
    } catch (err) {
      settle("throw", err);
    }
  }
  function settle(type, value) {
    switch (type) {
      case "return":
        front.resolve({
          value: value,
          done: !0
        });
        break;
      case "throw":
        front.reject(value);
        break;
      default:
        front.resolve({
          value: value,
          done: !1
        });
    }
    (front = front.next) ? resume(front.key, front.arg) : back = null;
  }
  this._invoke = function (key, arg) {
    return new Promise(function (resolve, reject) {
      var request = {
        key: key,
        arg: arg,
        resolve: resolve,
        reject: reject,
        next: null
      };
      back ? back = back.next = request : (front = back = request, resume(key, arg));
    });
  }, "function" != typeof gen["return"] && (this["return"] = void 0);
}
AsyncGenerator.prototype["function" == typeof Symbol && Symbol.asyncIterator || "@@asyncIterator"] = function () {
  return this;
}, AsyncGenerator.prototype.next = function (arg) {
  return this._invoke("next", arg);
}, AsyncGenerator.prototype["throw"] = function (arg) {
  return this._invoke("throw", arg);
}, AsyncGenerator.prototype["return"] = function (arg) {
  return this._invoke("return", arg);
};