"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ReactRefreshModule_runtime_1 = __importDefault(require("./internal/ReactRefreshModule.runtime"));
let refreshModuleRuntime = ReactRefreshModule_runtime_1.default.toString();
refreshModuleRuntime = refreshModuleRuntime.slice(refreshModuleRuntime.indexOf('{') + 1, refreshModuleRuntime.lastIndexOf('}'));
const ReactRefreshLoader = function ReactRefreshLoader(source, inputSourceMap) {
    this.callback(null, `${source}\n\n;${refreshModuleRuntime}`, inputSourceMap);
};
exports.default = ReactRefreshLoader;
//# sourceMappingURL=loader.js.map