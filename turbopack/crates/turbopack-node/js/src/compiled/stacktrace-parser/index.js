if (typeof __nccwpck_require__ !== "undefined")
  __nccwpck_require__.ab = __dirname + "/";

var n = "<unknown>";
export function parse(e) {
  var r = e.split("\n");
  return r.reduce(function (e, r) {
    var n =
      parseChrome(r) ||
      parseWinjs(r) ||
      parseGecko(r) ||
      parseNode(r) ||
      parseJSC(r);
    if (n) {
      e.push(n);
    }
    return e;
  }, []);
}
var a =
  /^\s*at (.*?) ?\(((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|\/|[a-z]:\\|\\\\).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
var l = /\((\S*)(?::(\d+))(?::(\d+))\)/;
function parseChrome(e) {
  var r = a.exec(e);
  if (!r) {
    return null;
  }
  var u = r[2] && r[2].indexOf("native") === 0;
  var t = r[2] && r[2].indexOf("eval") === 0;
  var i = l.exec(r[2]);
  if (t && i != null) {
    r[2] = i[1];
    r[3] = i[2];
    r[4] = i[3];
  }
  return {
    file: !u ? r[2] : null,
    methodName: r[1] || n,
    arguments: u ? [r[2]] : [],
    lineNumber: r[3] ? +r[3] : null,
    column: r[4] ? +r[4] : null,
  };
}
var u =
  /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i;
function parseWinjs(e) {
  var r = u.exec(e);
  if (!r) {
    return null;
  }
  return {
    file: r[2],
    methodName: r[1] || n,
    arguments: [],
    lineNumber: +r[3],
    column: r[4] ? +r[4] : null,
  };
}
var t =
  /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|webpack|resource|\[native).*?|[^@]*bundle)(?::(\d+))?(?::(\d+))?\s*$/i;
var i = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
function parseGecko(e) {
  var r = t.exec(e);
  if (!r) {
    return null;
  }
  var a = r[3] && r[3].indexOf(" > eval") > -1;
  var l = i.exec(r[3]);
  if (a && l != null) {
    r[3] = l[1];
    r[4] = l[2];
    r[5] = null;
  }
  return {
    file: r[3],
    methodName: r[1] || n,
    arguments: r[2] ? r[2].split(",") : [],
    lineNumber: r[4] ? +r[4] : null,
    column: r[5] ? +r[5] : null,
  };
}
var s = /^\s*(?:([^@]*)(?:\((.*?)\))?@)?(\S.*?):(\d+)(?::(\d+))?\s*$/i;
function parseJSC(e) {
  var r = s.exec(e);
  if (!r) {
    return null;
  }
  return {
    file: r[3],
    methodName: r[1] || n,
    arguments: [],
    lineNumber: +r[4],
    column: r[5] ? +r[5] : null,
  };
}
var o =
  /^\s*at (?:((?:\[object object\])?[^\\/]+(?: \[as \S+\])?) )?\(?(.*?):(\d+)(?::(\d+))?\)?\s*$/i;
function parseNode(e) {
  var r = o.exec(e);
  if (!r) {
    return null;
  }
  return {
    file: r[2],
    methodName: r[1] || n,
    arguments: [],
    lineNumber: +r[3],
    column: r[4] ? +r[4] : null,
  };
}
