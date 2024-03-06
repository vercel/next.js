import sermver = require('../');
import SemVer = require('./semver');

declare class Comparator {
    constructor(comp: string | Comparator, optionsOrLoose?: boolean | sermver.Options);

    semver: SemVer;
    operator: '' | '=' | '<' | '>' | '<=' | '>=';
    value: string;
    loose: boolean;
    options: sermver.Options;
    parse(comp: string): void;
    test(version: string | SemVer): boolean;
    intersects(comp: Comparator, optionsOrLoose?: boolean | sermver.Options): boolean;
}

export = Comparator;
