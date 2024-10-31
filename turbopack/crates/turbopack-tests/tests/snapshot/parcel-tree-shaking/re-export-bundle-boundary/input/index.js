import { OPERATIONAL_EVENT_TYPE } from "./types";

output = import("./async").then(({default: v}) => [OPERATIONAL_EVENT_TYPE, v])
