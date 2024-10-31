import { foo as bar } from "./c.mjs";

export const foo = "foo";

export function run() {
	return `b:${foo}:${bar}`;
}
