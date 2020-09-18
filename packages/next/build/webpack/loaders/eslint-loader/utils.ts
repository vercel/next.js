function toBooleanMap(keys: Array<string>, defaultValue: Boolean, displayName: string) {
  if (keys && !Array.isArray(keys)) {
      throw new Error(`${displayName} must be an array.`);
  }
  if (keys && keys.length > 0) {
      return keys.reduce((map:any, def) => {
          const [key, value] = def.split(":");

          if (key !== "__proto__") {
              map[key] = value === void 0
                  ? defaultValue
                  : value === "true";
          }

          return map;
      }, {});
  }
  return void 0;
}

export function createConfigDataFromOptions(options:any) {
  const {
      ignorePattern,
      parser,
      parserOptions,
      plugins,
      rules
  } = options;
  const env = toBooleanMap(options.envs, true, "envs");
  const globals = toBooleanMap(options.globals, false, "globals");

  if (
      env === void 0 &&
      globals === void 0 &&
      (ignorePattern === void 0 || ignorePattern.length === 0) &&
      parser === void 0 &&
      parserOptions === void 0 &&
      plugins === void 0 &&
      rules === void 0
  ) {
      return null;
  }
  return {
      env,
      globals,
      ignorePatterns: ignorePattern,
      parser,
      parserOptions,
      plugins,
      rules
  };
}
