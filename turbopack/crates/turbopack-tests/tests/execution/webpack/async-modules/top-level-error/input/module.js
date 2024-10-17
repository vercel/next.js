import { count } from "./counter";

const c = count();
throw new Error("expected rejection " + c);

export default "ok";
