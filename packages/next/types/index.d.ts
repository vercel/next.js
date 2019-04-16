declare module '@babel/plugin-transform-modules-commonjs';
declare module 'next-server/next-config';
declare module 'next-server/constants';
declare module 'webpack/lib/GraphHelpers';
declare module 'unfetch'

declare module 'next/router' {
  import * as all from 'next/client/router'
  export = all
}

declare module 'next-server/dist/lib/data-manager-context' {
  import * as all from 'next-server/lib/data-manager-context'
  export = all
}

declare module 'next-server/dist/lib/router-context' {
  import * as all from 'next-server/lib/router-context'
  export = all
}

declare module 'next-server/dist/lib/router/router' {
  import * as all from 'next-server/lib/router/router'
  export = all
}

declare module 'next-server/dist/lib/request-context' {
  import * as all from 'next-server/lib/request-context'
  export = all
}

declare module 'next-server/dist/lib/utils' {
  export function loadGetInitialProps(Component: any, ctx: any): Promise<any>
  export function execOnce(fn: any): (...args: any[]) => void
}

declare module 'next/dist/compiled/nanoid/index.js' {
  function nanoid(size?: number): string;

  export = nanoid;
}

declare module 'next/dist/compiled/resolve/index.js' {
  import resolve from 'resolve'

  export = resolve;
}

declare module 'next/dist/compiled/arg/index.js' {
  function arg<T extends arg.Spec>(spec: T, options?: {argv?: string[], permissive?: boolean}): arg.Result<T>;

  namespace arg {
    export type Handler = (value: string) => any;

    export interface Spec {
      [key: string]: string | Handler | [Handler];
    }

    export type Result<T extends Spec> = { _: string[] } & {
      [K in keyof T]: T[K] extends string
        ? never
        : T[K] extends Handler
        ? ReturnType<T[K]>
        : T[K] extends [Handler]
        ? Array<ReturnType<T[K][0]>>
        : never
    };
  }

  export = arg;
}

declare module 'autodll-webpack-plugin' {
  import webpack from 'webpack'
  class AutoDllPlugin implements webpack.Plugin {
    constructor(settings?: {
      inject?: boolean,
      plugins?: webpack.Configuration["plugins"],
      context?: string,
      debug?: boolean,
      filename?: string,
      path?: string,
      inherit?: boolean,
      entry?: webpack.Entry,
      config?: webpack.Configuration
    })
    apply: webpack.Plugin["apply"]
    [k: string]: any
  }

  export = AutoDllPlugin
}
