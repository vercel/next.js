const { platform, endianness, arch } = require("os");
const { platform: processPlatform } = require("process");

let p = process;

const binding1 = require(`esbuild-${
  process.arch
}-${platform()}-${endianness()}`);
const binding2 = require(`esbuild-${arch()}-${platform()}-${endianness()}`);
const binding3 = require(`esbuild-${arch()}-${
  process.platform
}-${endianness()}`);
const binding4 = require(`esbuild-${process.arch}-${
  process.platform
}-${endianness()}`);
const binding5 = require(`esbuild-${p.arch}-${p.platform}-${endianness()}`);
const binding6 = require(`esbuild-${
  p.arch
}-${processPlatform}-${endianness()}`);
