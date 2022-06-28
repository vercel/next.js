function cov_473891610594984201() {
    var path = "anon";
    var hash = "13293363232410732979";
    var global = new ((function(){}).constructor)("return this")();
    var gcv = "__coverage__";
    var coverageData = {
        all: false,
        path: "anon",
        statementMap: {
            "0": {
                start: {
                    line: 1,
                    column: 16
                },
                end: {
                    line: 1,
                    column: 24
                }
            },
            "1": {
                start: {
                    line: 1,
                    column: 25
                },
                end: {
                    line: 1,
                    column: 33
                }
            },
            "2": {
                start: {
                    line: 3,
                    column: 0
                },
                end: {
                    line: 3,
                    column: 11
                }
            },
            "3": {
                start: {
                    line: 4,
                    column: 0
                },
                end: {
                    line: 6,
                    column: 1
                }
            },
            "4": {
                start: {
                    line: 5,
                    column: 2
                },
                end: {
                    line: 5,
                    column: 14
                }
            }
        },
        fnMap: {
            "0": {
                name: "x",
                decl: {
                    start: {
                        line: 1,
                        column: 10
                    },
                    end: {
                        line: 1,
                        column: 11
                    }
                },
                loc: {
                    start: {
                        line: 1,
                        column: 14
                    },
                    end: {
                        line: 1,
                        column: 35
                    }
                },
                line: 1
            }
        },
        branchMap: {},
        s: {
            "0": 0,
            "1": 0,
            "2": 0,
            "3": 0,
            "4": 0
        },
        f: {
            "0": 0
        },
        b: {},
        _coverageSchema: "11020577277169172593",
        hash: "13293363232410732979"
    };
    var coverage = global[gcv] || (global[gcv] = {});
    if (!coverage[path] || coverage[path].hash !== hash) {
        coverage[path] = coverageData;
    }
    var actualCoverage = coverage[path];
    {
        cov_473891610594984201 = function() {
            return actualCoverage;
        };
    }
    return actualCoverage;
}
cov_473891610594984201();
function* x() {
    cov_473891610594984201().f[0]++;
    cov_473891610594984201().s[0]++;
    yield 1;
    cov_473891610594984201().s[1]++;
    yield 2;
}
;
var k;
cov_473891610594984201().s[2]++;
output = 0;
cov_473891610594984201().s[3]++;
for (k of x()){
    cov_473891610594984201().s[4]++;
    output += k;
}
