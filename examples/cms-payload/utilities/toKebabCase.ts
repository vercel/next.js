export const toKebabCase = (string): string =>
  string
    ?.replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
