import { v } from "./library/a.js";

import * as y from "./library/a.js";

output = [v, sideEffectNoop(y).v];
