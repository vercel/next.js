// The Turbopack HMR client can't be properly omitted at the moment (WEB-1589),
// so instead we remap its import to this file in webpack builds.
export function connect() {}
