import { Rewrite, Header } from '../../lib/check-custom-routes'
import WebpackDevMiddleware from 'webpack-dev-middleware'
import { PluginMetaData } from '../../build/plugins/collect-plugins';
import webpack, { Configuration } from "webpack";

/**
 * https://nextjs.org/docs/api-reference/next.config.js/introduction
 */
export interface NextConfig
{
  env: Record<string, string>;

  /**
   * https://nextjs.org/docs/api-reference/next.config.js/custom-webpack-config
   */
  webpack(webpackConfig: Configuration, options: IWebpackExtraOption): Configuration;
  webpackDevMiddleware: WebpackDevMiddleware.WebpackDevMiddleware

  distDir: string;
  assetPrefix: string;
  configOrigin: 'server' | 'default';
  useFileSystemPublicRoutes: boolean;

  generateBuildId: () => string | null;

  generateEtags: boolean;
  pageExtensions: string[];
  target: NextConfigServerTarget;
  poweredByHeader: boolean;
  compress: boolean;

  devIndicators: {
    buildActivity: boolean;
    autoPrerender: boolean;
  };
  onDemandEntries: {
    maxInactiveAge: number;
    pagesBufferLength: number;
  };

  amp: {
    canonicalBase: string;
  };
  experimental: {
    redirects(): IResolveAble<Rewrite[]>;
    rewrites(): IResolveAble<Rewrite[]>;
    headers(): IResolveAble<Header[]>;

    cpus: number;

    css: boolean;
    scss: boolean;
    documentMiddleware: boolean;
    granularChunks: boolean;
    modern: boolean;
    plugins: boolean;
    profiling: boolean;
    sprFlushToDisk: boolean;
    reactMode: string;
    workerThreads: boolean;
    basePath: string;
    static404: boolean;

    amp: {
      validator(html: string, pathname: string): Promise<void>
    };

    conformance: boolean;
  };
  future: {
    excludeDefaultMomentLocales: boolean;
  };

  publicRuntimeConfig: {};
  serverRuntimeConfig: {};

  reactStrictMode: boolean;

  exportTrailingSlash: boolean;

  exportPathMap(defaultMap: ExportPathMap, options?: IDeepPartial<{
    dev: boolean,
    dir: string,
    outDir: string,
    distDir: string,
    buildId: string,
  }>): IResolveAble<ExportPathMap>

  plugins: PluginConfig[];

  typescript: {
    ignoreDevErrors: boolean;
    ignoreBuildErrors: boolean;
  };

  crossOrigin: 'anonymous' | string;
}

interface IWebpackExtraOption
{
  dir: string;
  dev: boolean;
  isServer: boolean;
  buildId: string;
  config: NextConfigInput;
  defaultLoaders: any;
  totalPages: number;
  webpack: typeof webpack;
}

/**
 * https://nextjs.org/docs/api-reference/next.config.js/introduction
 */
export interface NextConfigInput extends IDeepPartial<NextConfig>
{
  [p: string]: any,

  /**
   * https://nextjs.org/docs/api-reference/next.config.js/custom-webpack-config
   */
  webpack<T extends object, R extends object>(webpackConfig: T, options?: IWebpackExtraOption): T & R & Configuration;
  /**
   * https://nextjs.org/docs/api-reference/next.config.js/custom-webpack-config
   */
  webpack<T extends any>(webpackConfig: any, options?: IWebpackExtraOption): T;
}

type IModuleAble<T> = T & {
  default?: T | any
}

export type NextConfigUserInput = NextConfigInput | ((phase: string, options: { defaultConfig: NextConfigInput }) => NextConfigInput)

export type NextConfigUserInputModule = IModuleAble<NextConfigUserInput>

export type ExportPathMap = {
  [page: string]: {
    page: string;
    query?: { [key: string]: string }
  }
}

type PluginConfig =
  | string
  | {
  name: string
  config: { [name: string]: any }
}

export type IDeepPartial<T> = T extends Record<string, any> ? {
  [P in keyof T]?: IDeepPartial<T[P]> | null;
} : T

type IResolveAble<T> = PromiseLike<T> | T

export type NextConfigServerTarget = 'server' | 'serverless' | 'experimental-serverless-trace'
