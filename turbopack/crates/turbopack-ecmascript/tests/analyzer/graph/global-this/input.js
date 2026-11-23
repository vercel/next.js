const g = globalThis;
const n = global;

const processPlatform = globalThis.process.platform;
const nodeProcessArch = global.process.arch;
const env = globalThis.process.env;
const aliased = g.process.platform;
var p = globalThis.process;
const aliasedProcess = p.platform;

const binding = require(`esbuild-${globalThis.process.arch}-${n.process.platform}`);

// Not resolved, the global might not exist (feature detection)
const processCheck = globalThis.process ? 1 : 2;
const processAndCheck = global.process && true;
const aliasedProcessCheck = p ? 1 : 2;

// Not resolved yet
const obj = globalThis.Object;
const buffer = global.Buffer;
const nav = globalThis.navigator;
const url = new globalThis.URL("./file.js", import.meta.url);
const nested = globalThis.globalThis.process.platform;

const unknownMember = globalThis.somethingElse;
const notAGlobal = globalThis.require;
