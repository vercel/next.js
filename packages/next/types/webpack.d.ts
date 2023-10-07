/* eslint-disable import/no-extraneous-dependencies, @typescript-eslint/no-unused-vars , no-shadow */
// Type definitions for webpack 4.39
// Project: https://github.com/webpack/webpack
// Definitions by: Qubo <https://github.com/tkqubo>
//                 Benjamin Lim <https://github.com/bumbleblym>
//                 Boris Cherny <https://github.com/bcherny>
//                 Tommy Troy Lin <https://github.com/tommytroylin>
//                 Mohsen Azimi <https://github.com/mohsen1>
//                 Jonathan Creamer <https://github.com/jcreamer898>
//                 Alan Agius <https://github.com/alan-agius4>
//                 Spencer Elliott <https://github.com/elliottsj>
//                 Jason Cheatham <https://github.com/jason0x43>
//                 Dennis George <https://github.com/dennispg>
//                 Christophe Hurpeau <https://github.com/christophehurpeau>
//                 ZSkycat <https://github.com/ZSkycat>
//                 John Reilly <https://github.com/johnnyreilly>
//                 Ryan Waskiewicz <https://github.com/rwaskiewicz>
//                 Kyle Uehlein <https://github.com/kuehlein>
//                 Grgur Grisogono <https://github.com/grgur>
//                 Rubens Pinheiro Gonçalves Cavalcante <https://github.com/rubenspgcavalcante>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.3

/// <reference types="node" />

declare module 'mini-css-extract-plugin'
declare module 'next/dist/compiled/loader-utils3'

declare module 'next/dist/compiled/webpack/webpack' {
  import type webpackSources from 'webpack-sources1'
  export function init(): void
  export let BasicEvaluatedExpression: any
  export let GraphHelpers: any
  export let sources: typeof webpackSources
  export let StringXor: any
  export {
    default as webpack,
    Compiler,
    Compilation,
    Module,
    Stats,
    Template,
    RuntimeModule,
    RuntimeGlobals,
    NormalModule,
    ResolvePluginInstance,
    ModuleFilenameHelpers,
    LoaderDefinitionFunction,
    LoaderContext,
  } from 'webpack'
}
