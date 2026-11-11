export default class Reporter {
  onInit(context) {
    const state = globalThis[Symbol.for('next-test.watch-close-component')]
    state.trace.push('init')
    context.onClose(async () => {
      state.trace.push('close-start')
      state.closeEntered.resolve()
      if (state.gated) await state.releaseClose.promise
      state.trace.push('close-end')
    })
  }
}
