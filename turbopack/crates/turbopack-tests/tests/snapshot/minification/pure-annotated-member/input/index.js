function make() {
  return {
    run() {
      console.log('member call ran')
    },
  }
}

// The PURE annotation applies to the inner `make()` call only. The outer
// `.run()` call has side effects and must be kept.
;(/* @__PURE__ */ make()).run()
