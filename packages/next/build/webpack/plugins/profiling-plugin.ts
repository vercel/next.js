// Copy of https://github.com/webpack/webpack/blob/master/lib/debug/ProfilingPlugin.js
// License:
/*
Copyright JS Foundation and other contributors

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// Includes fix https://github.com/webpack/webpack/pull/9566
// Includes support for custom tracer that can capture across multiple builds
const pluginName = 'ProfilingPlugin'

export class ProfilingPlugin {
  tracer: any
  /**
   * @param {ProfilingPluginOptions=} opts options object
   */
  constructor(opts: { tracer: any }) {
    this.tracer = opts.tracer
  }

  apply(compiler: any) {
    const tracer = this.tracer

    // Compiler Hooks
    Object.keys(compiler.hooks).forEach((hookName) => {
      compiler.hooks[hookName].intercept(
        makeInterceptorFor('Compiler', tracer)(hookName)
      )
    })

    Object.keys(compiler.resolverFactory.hooks).forEach((hookName) => {
      compiler.resolverFactory.hooks[hookName].intercept(
        makeInterceptorFor('Resolver', tracer)(hookName)
      )
    })

    compiler.hooks.compilation.tap(
      pluginName,
      (
        compilation: any,
        { normalModuleFactory, contextModuleFactory }: any
      ) => {
        interceptAllHooksFor(compilation, tracer, 'Compilation')
        interceptAllHooksFor(
          normalModuleFactory,
          tracer,
          'Normal Module Factory'
        )
        interceptAllHooksFor(
          contextModuleFactory,
          tracer,
          'Context Module Factory'
        )
        interceptAllParserHooks(normalModuleFactory, tracer)
        interceptTemplateInstancesFrom(compilation, tracer)
      }
    )
  }
}

const interceptTemplateInstancesFrom = (compilation: any, tracer: any) => {
  const {
    mainTemplate,
    chunkTemplate,
    hotUpdateChunkTemplate,
    moduleTemplates,
  } = compilation

  const { javascript, webassembly } = moduleTemplates
  ;[
    {
      instance: mainTemplate,
      name: 'MainTemplate',
    },
    {
      instance: chunkTemplate,
      name: 'ChunkTemplate',
    },
    {
      instance: hotUpdateChunkTemplate,
      name: 'HotUpdateChunkTemplate',
    },
    {
      instance: javascript,
      name: 'JavaScriptModuleTemplate',
    },
    {
      instance: webassembly,
      name: 'WebAssemblyModuleTemplate',
    },
  ].forEach((templateObject) => {
    Object.keys(templateObject.instance.hooks).forEach((hookName) => {
      templateObject.instance.hooks[hookName].intercept(
        makeInterceptorFor(templateObject.name, tracer)(hookName)
      )
    })
  })
}

const interceptAllHooksFor = (instance: any, tracer: any, logLabel: any) => {
  if (Reflect.has(instance, 'hooks')) {
    Object.keys(instance.hooks).forEach((hookName) => {
      instance.hooks[hookName].intercept(
        makeInterceptorFor(logLabel, tracer)(hookName)
      )
    })
  }
}

const interceptAllParserHooks = (moduleFactory: any, tracer: any) => {
  const moduleTypes = [
    'javascript/auto',
    'javascript/dynamic',
    'javascript/esm',
    'json',
    'webassembly/experimental',
  ]

  moduleTypes.forEach((moduleType) => {
    moduleFactory.hooks.parser
      .for(moduleType)
      .tap('ProfilingPlugin', (parser: any) => {
        interceptAllHooksFor(parser, tracer, 'Parser')
      })
  })
}

const makeInterceptorFor = (_instance: any, tracer: any) => (
  hookName: any
) => ({
  register: ({ name, type, context, fn }: any) => {
    const newFn = makeNewProfiledTapFn(hookName, tracer, {
      name,
      type,
      fn,
    })
    return {
      name,
      type,
      context,
      fn: newFn,
    }
  },
})

// TODO improve typing
/** @typedef {(...args: TODO[]) => void | Promise<TODO>} PluginFunction */

/**
 * @param {string} hookName Name of the hook to profile.
 * @param {Trace} tracer The trace object.
 * @param {object} options Options for the profiled fn.
 * @param {string} options.name Plugin name
 * @param {string} options.type Plugin type (sync | async | promise)
 * @param {PluginFunction} options.fn Plugin function
 * @returns {PluginFunction} Chainable hooked function.
 */
const makeNewProfiledTapFn = (
  _hookName: any,
  tracer: any,
  { name, type, fn }: any
) => {
  const defaultCategory = ['blink.user_timing']

  switch (type) {
    case 'promise':
      return (...args: any) => {
        const id = ++tracer.counter
        tracer.trace.begin({
          name,
          id,
          cat: defaultCategory,
        })
        const promise = /** @type {Promise<*>} */ fn(...args)
        return promise.then((r: any) => {
          tracer.trace.end({
            name,
            id,
            cat: defaultCategory,
          })
          return r
        })
      }
    case 'async':
      return (...args: any) => {
        const id = ++tracer.counter
        tracer.trace.begin({
          name,
          id,
          cat: defaultCategory,
        })
        const callback = args.pop()
        /* eslint-disable */
        fn(...args, (...r: any) => {
          tracer.trace.end({
            name,
            id,
            cat: defaultCategory,
          })
          callback(...r)
        })
        /* eslint-enable */
      }
    case 'sync':
      return (...args: any) => {
        const id = ++tracer.counter
        // Do not instrument ourself due to the CPU
        // profile needing to be the last event in the trace.
        if (name === pluginName) {
          return fn(...args)
        }

        tracer.trace.begin({
          name,
          id,
          cat: defaultCategory,
        })
        let r
        try {
          r = fn(...args)
        } catch (error) {
          tracer.trace.end({
            name,
            id,
            cat: defaultCategory,
          })
          throw error
        }
        tracer.trace.end({
          name,
          id,
          cat: defaultCategory,
        })
        return r
      }
    default:
      break
  }
}
