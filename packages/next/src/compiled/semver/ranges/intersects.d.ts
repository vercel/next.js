import Range = require('../classes/range');
import semver = require('../');

/**
 * Return true if any of the ranges comparators intersect
 */
declare function intersects(
    range1: string | Range,
    range2: string | Range,
    optionsOrLoose?: boolean | semver.Options,
): boolean;

export = intersects;
