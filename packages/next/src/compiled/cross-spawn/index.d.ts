// Type definitions for cross-spawn 6.0
// Project: https://github.com/moxystudio/node-cross-spawn
// Definitions by: Alorel <https://github.com/Alorel>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/// <reference types="node" />

import * as child_process from 'child_process';

declare function spawn(command: string, args?: string[], options?: child_process.SpawnOptions): child_process.ChildProcess;

declare namespace spawn {
    const sync: typeof child_process.spawnSync;
}

export = spawn;
