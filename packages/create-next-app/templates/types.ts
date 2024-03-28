import { PackageManager } from "../helpers/get-pkg-manager";

export type TemplateType = "default" | "app" | "default-tw" | "app-tw";
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
  tailwind: boolean;
  srcDir: boolean;
  importAlias: string;
}
