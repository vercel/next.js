export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { AsyncResource } = await import('node:async_hooks')
    const bind = AsyncResource.prototype.bind
    const counter = globalThis as { boundFunctions?: number }
    counter.boundFunctions = 0
    AsyncResource.prototype.bind = function (this: unknown, ...args: any) {
      counter.boundFunctions!++
      return bind.apply(this, args)
    } as typeof bind
  }
}
