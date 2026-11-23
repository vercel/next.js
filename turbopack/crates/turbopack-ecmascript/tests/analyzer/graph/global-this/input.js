const g = globalThis;
const n = global;

const processPlatform = globalThis.process.platform;
const nodeProcessArch = global.process.arch;
const env = globalThis.process.env;
const nested = globalThis.globalThis.global.process.platform;
const aliased = g.process.platform;

const binding = require(`esbuild-${globalThis.process.arch}-${n.process.platform}`);

const obj = globalThis.Object;
const buffer = global.Buffer;
const nav = globalThis.navigator;
const url = new globalThis.URL("./file.js", import.meta.url);
const unknownMember = globalThis.somethingElse;
const notAGlobal = globalThis.require;
