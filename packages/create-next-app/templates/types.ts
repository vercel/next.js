import { PackageManager } from "../helpers/get-pkg-manager";

export type TemplateType =
  | "app"
  | "app-api"
  | "app-empty"
  | "app-tw"
  | "app-tw-desktop-first"
  | "app-tw-empty"
  | "app-tw-desktop-first-empty"
  | "default"
  | "default-empty"
  | "default-tw"
  | "default-tw-desktop-first"
  | "default-tw-empty"
  | "default-tw-desktop-first-empty";
export type TemplateMode = "js" | "ts";

export interface GetTemplateFileArgs {
  template: TemplateType;
  mode: TemplateMode;
  file: string;
}

export interface InstallTemplateArgs {
  appName: string;
  root: string;
  packageManager: PackageManager;
  isOnline: boolean;
  template: TemplateType;
  mode: TemplateMode;
  eslint: boolean;
  biome: boolean;
  tailwind: boolean;
  srcDir: boolean;
  importAlias: string;
  skipInstall: boolean;
  bundler: Bundler;
  reactCompiler: boolean;
}

export enum Bundler {
  Turbopack = "turbopack",
  Webpack = "webpack",
  Rspack = "rspack",
}
