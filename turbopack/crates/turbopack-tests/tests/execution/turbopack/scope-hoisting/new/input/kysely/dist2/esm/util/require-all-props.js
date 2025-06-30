/// <reference types="./require-all-props.d.ts" />
/**
 * Helper function to check listed properties according to given type. Check if all properties has been used when object is initialised.
 *
 * Example use:
 *
 * ```ts
 * type SomeType = { propA: string; propB?: number; }
 *
 * // propB has to be mentioned even it is optional. It still should be initialized with undefined.
 * const a: SomeType = requireAllProps<SomeType>({ propA: "value A", propB: undefined });
 *
 * // checked type is implicit for variable.
 * const b = requireAllProps<SomeType>({ propA: "value A", propB: undefined });
 * ```
 *
 * Wrong use of this helper:
 *
 * 1. Omit checked type - all checked properties will be expect as of type never
 *
 * ```ts
 * type SomeType = { propA: string; propB?: number; }
 * // const z: SomeType = requireAllProps({ propC: "no type will work" }); // Property 'propA' is missing in type '{ propC: string; }' but required in type 'SomeType'.
 * ```
 *
 * 2. Apply to spreaded object - there is no way how to check in compile time if spreaded object contains all properties
 *
 * ```ts
 * type SomeType = { propA: string; propB?: number; }
 * const y: SomeType = { propA: "" }; // valid object according to SomeType declaration
 * // const x = requireAllProps<SomeType>({ ...y }); // Argument of type '{ propA: string; propB?: number; }' is not assignable to parameter of type 'AllProps<SomeType>'.
 * ```
 *
 * @param obj object to check if all properties has been used
 * @returns untouched obj parameter is returned
 */
export function requireAllProps(obj) {
  return obj
}
