import { spawn } from "child_process";

let x = spawn(process.argv[0], ["-e", "console.log('foo');"]);
