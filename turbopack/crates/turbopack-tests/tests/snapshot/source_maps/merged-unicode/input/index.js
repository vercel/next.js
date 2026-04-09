// "entry-base.js [app-rsc] (ecmascript) <module evaluation>" with
// ["reflect-utils.js [app-rsc] (ecmascript)",
// "params.js [app-rsc] (ecmascript)",
// "segment-value-encoding.js [app-rsc] (ecmascript)",
// "collect-segment-data.js [app-rsc] (ecmascript)",
// "entry-base.js [app-rsc] (ecmascript) <locals>"]

// "entry-base.js [test] (ecmascript) <module evaluation>" with
// ["reflect-utils.js [test] (ecmascript)",
// "params.js [test] (ecmascript)",
// "segment-value-encoding.js [test] (ecmascript)",
//  "collect-segment-data.js [test] (ecmascript)",
//  "entry-base.js [test] (ecmascript) <locals>"]

if (Date.now() > 0) {
  require('./index1.js')
}
if (Date.now() > 0) {
  require('./index2.js')
}

