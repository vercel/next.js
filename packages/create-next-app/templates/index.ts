import { install } from "../helpers/install";
import { copy } from "../helpers/copy";

import { async as glob } from "fast-glob";
import os from "os";
import fs from "fs/promises";
import path from "path";
import { cyan, bold } from "picocolors";
import { Sema } from "async-sema";
import pkg from "../package.json";

import { GetTemplateFileArgs, InstallTemplateArgs } from "./types";

// Do not rename or format. sync-react script relies on this line.
// prettier-ignore
const nextjsReactPeerVersion = "^19.0.0";

/**
 * Get the file path for a given file in a template, e.g. "next.config.js".
 */
export const getTemplateFile = ({
  template,
  mode,
  file,
}: GetTemplateFileArgs): string => {
  return path.join(__dirname, template, mode, file);
};

export const SRC_DIR_NAMES = ["app", "pages", "styles"];

/**
 * Install a Next.js internal template to a given `root` directory.
 */
export const installTemplate = async ({
  appName,
  root,
  packageManager,
  isOnline,
  template,
  mode,
  tailwind,
  eslint,
  srcDir,
  importAlias,
  skipInstall,
  turbopack,
}: InstallTemplateArgs) => {
  console.log(bold(`Using ${packageManager}.`));

  /**
   * Copy the template files to the target directory.
   */
  console.log("\nInitializing project with template:", template, "\n");
  const isApi = template === "app-api";
  const templatePath = path.join(__dirname, template, mode);
  const copySource = ["**"];
  if (!eslint) copySource.push("!eslint.config.mjs");
  if (!tailwind) copySource.push("!postcss.config.mjs");

  await copy(copySource, root, {
    parents: true,
    cwd: templatePath,
    rename(name) {
      switch (name) {
        case "gitignore": {
          return `.${name}`;
        }
        // README.md is ignored by webpack-asset-relocator-loader used by ncc:
        // https://github.com/vercel/webpack-asset-relocator-loader/blob/e9308683d47ff507253e37c9bcbb99474603192b/src/asset-relocator.js#L227
        case "README-template.md": {
          return "README.md";
        }
        default: {
          return name;
        }
      }
    },
  });

  const tsconfigFile = path.join(
    root,
    mode === "js" ? "jsconfig.json" : "tsconfig.json",
  );
  await fs.writeFile(
    tsconfigFile,
    (await fs.readFile(tsconfigFile, "utf8"))
      .replace(
        `"@/*": ["./*"]`,
        srcDir ? `"@/*": ["./src/*"]` : `"@/*": ["./*"]`,
      )
      .replace(`"@/*":`, `"${importAlias}":`),
  );

  // update import alias in any files if not using the default
  if (importAlias !== "@/*") {
    const files = await glob("**/*", {
      cwd: root,
      dot: true,
      stats: false,
      // We don't want to modify compiler options in [ts/js]config.json
      // and none of the files in the .git folder
      // TODO: Refactor this to be an allowlist, rather than a denylist,
      // to avoid corrupting files that weren't intended to be replaced

      ignore: [
        "tsconfig.json",
        "jsconfig.json",
        ".git/**/*",
        "**/fonts/**",
        "**/favicon.ico",
      ],
    });
    const writeSema = new Sema(8, { capacity: files.length });
    await Promise.all(
      files.map(async (file) => {
        await writeSema.acquire();
        const filePath = path.join(root, file);
        if ((await fs.stat(filePath)).isFile()) {
          await fs.writeFile(
            filePath,
            (await fs.readFile(filePath, "utf8")).replace(
              `@/`,
              `${importAlias.replace(/\*/g, "")}`,
            ),
          );
        }
        writeSema.release();
      }),
    );
  }

  if (srcDir) {
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await Promise.all(
      SRC_DIR_NAMES.map(async (file) => {
        await fs
          .rename(path.join(root, file), path.join(root, "src", file))
          .catch((err) => {
            if (err.code !== "ENOENT") {
              throw err;
            }
          });
      }),
    );

    if (!isApi) {
      const isAppTemplate = template.startsWith("app");

      // Change the `Get started by editing pages/index` / `app/page` to include `src`
      const indexPageFile = path.join(
        "src",
        isAppTemplate ? "app" : "pages",
        `${isAppTemplate ? "page" : "index"}.${mode === "ts" ? "tsx" : "js"}`,
      );

      await fs.writeFile(
        indexPageFile,
        (await fs.readFile(indexPageFile, "utf8")).replace(
          isAppTemplate ? "app/page" : "pages/index",
          isAppTemplate ? "src/app/page" : "src/pages/index",
        ),
      );
    }
  }

  /** Copy the version from package.json or override for tests. */
  const version = process.env.NEXT_PRIVATE_TEST_VERSION ?? pkg.version;

  /** Create a package.json for the new project and write it to disk. */
  const packageJson: any = {
    name: appName,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: `next dev${turbopack ? " --turbopack" : ""}`,
      build: "next build",
      start: "next start",
      lint: "next lint",
    },
    /**
     * Default dependencies.
     */
    dependencies: {
      react: nextjsReactPeerVersion,
      "react-dom": nextjsReactPeerVersion,
      next: version,
    },
    devDependencies: {},
  };

  /**
   * TypeScript projects will have type definitions and other devDependencies.
   */
  if (mode === "ts") {
    packageJson.devDependencies = {
      ...packageJson.devDependencies,
      typescript: "^5",
      "@types/node": "^20",
      "@types/react": "^19",
      "@types/react-dom": "^19",
    };
  }

  /* Add Tailwind CSS dependencies. */
  if (tailwind) {
    packageJson.devDependencies = {
      ...packageJson.devDependencies,
      "@tailwindcss/postcss": "^4",
      tailwindcss: "^4",
    };
  }

  /* Default ESLint dependencies. */
  if (eslint) {
    packageJson.devDependencies = {
      ...packageJson.devDependencies,
      eslint: "^9",
      "eslint-config-next": version,
      // TODO: Remove @eslint/eslintrc once eslint-config-next is pure Flat config
      "@eslint/eslintrc": "^3",
    };
  }

  if (isApi) {
    delete packageJson.dependencies.react;
    delete packageJson.dependencies["react-dom"];
    // We cannot delete `@types/react` now since it is used in
    // route type definitions e.g. `.next/types/app/page.ts`.
    // TODO(jiwon): Implement this when we added logic to
    // auto-install `react` and `react-dom` if page.tsx was used.
    // We can achieve this during verify-typescript stage and see
    // if a type error was thrown at `distDir/types/app/page.ts`.
    delete packageJson.devDependencies["@types/react-dom"];

    delete packageJson.scripts.lint;
  }

  const devDeps = Object.keys(packageJson.devDependencies).length;
  if (!devDeps) delete packageJson.devDependencies;

  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify(packageJson, null, 2) + os.EOL,
  );

  if (skipInstall) return;

  console.log("\nInstalling dependencies:");
  for (const dependency in packageJson.dependencies)
    console.log(`- ${cyan(dependency)}`);

  if (devDeps) {
    console.log("\nInstalling devDependencies:");
    for (const dependency in packageJson.devDependencies)
      console.log(`- ${cyan(dependency)}`);
  }

  console.log();

  await install(packageManager, isOnline);
};

export * from "./types";
