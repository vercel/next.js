export function createTimeController() {
  let fixedTime = Date.now()

  return {
    install: (browser) => {
      return browser.eval(`
        (() => {
          const OriginalDate = Date;
          const originalSetTimeout = globalThis.setTimeout;
          const originalSetInterval = globalThis.setInterval;
          const originalClearTimeout = globalThis.clearTimeout;
          const originalClearInterval = globalThis.clearInterval;

          let fixedTime = ${fixedTime};
          let timerIdCounter = 1;
          const timers = new Map();

          // Override the Date constructor
          globalThis.Date = class extends OriginalDate {
            constructor(...args) {
              if (args.length === 0) {
                super(fixedTime);
              } else {
                super(...args);
              }
            }

            static now() {
              return fixedTime;
            }
          };

          // Preserve static methods
          Object.setPrototypeOf(globalThis.Date, OriginalDate);

          // Override setTimeout
          globalThis.setTimeout = function(callback, delay, ...args) {
            const id = timerIdCounter++;
            timers.set(id, {
              callback,
              args,
              fireTime: fixedTime + (delay || 0),
              interval: false
            });
            return id;
          };

          // Override setInterval
          globalThis.setInterval = function(callback, delay, ...args) {
            const id = timerIdCounter++;
            timers.set(id, {
              callback,
              args,
              fireTime: fixedTime + (delay || 0),
              interval: true,
              delay: delay || 0
            });
            return id;
          };

          // Override clearTimeout
          globalThis.clearTimeout = function(id) {
            timers.delete(id);
          };

          // Override clearInterval
          globalThis.clearInterval = function(id) {
            timers.delete(id);
          };

          // Add method to advance time
          globalThis.__advanceTime = (ms) => {
            fixedTime += ms;

            // Fire any timers that should have fired
            const toFire = [];
            for (const [id, timer] of timers.entries()) {
              if (timer.fireTime <= fixedTime) {
                toFire.push({ id, timer });
              }
            }

            for (const { id, timer } of toFire) {
              try {
                timer.callback(...timer.args);
              } catch (e) {
                console.error('Timer callback error:', e);
              }

              if (timer.interval) {
                // Reschedule interval timer
                timer.fireTime = fixedTime + timer.delay;
              } else {
                // Remove one-time timer
                timers.delete(id);
              }
            }
          };
        })();
      `)
    },

    advance: async (browser, ms: number) => {
      fixedTime += ms
      await browser.eval(`globalThis.__advanceTime(${ms})`)
    },
  }
}
