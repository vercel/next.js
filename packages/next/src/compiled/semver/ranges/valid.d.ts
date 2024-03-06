import Range = require('../classes/range');
import semver = require('../');

/**
 * Return the valid range or null if it's not valid
 */
declare function validRange(
    range: string | Range | null | undefined,
    optionsOrLoose?: boolean | semver.Options,
): string;

export = validRange;
