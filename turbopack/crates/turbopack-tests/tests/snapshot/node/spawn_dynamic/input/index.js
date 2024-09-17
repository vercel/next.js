import { spawn } from "child_process";

const program = ['ls'];
const proc = spawn(program[0], ['-la']);
