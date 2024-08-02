"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var util = require("util");
var pathToRegexp = require("./index");
/**
 * An array of test cases with expected inputs and outputs.
 */
var TESTS = [
    /**
     * Simple paths.
     */
    [
        "/",
        undefined,
        ["/"],
        [
            ["/", ["/"], { path: "/", index: 0, params: {} }],
            ["/route", null, false]
        ],
        [
            [null, "/"],
            [{}, "/"],
            [{ id: 123 }, "/"]
        ]
    ],
    [
        "/test",
        undefined,
        ["/test"],
        [
            ["/test", ["/test"], { path: "/test", index: 0, params: {} }],
            ["/route", null, false],
            ["/test/route", null, false],
            ["/test/", ["/test/"], { path: "/test/", index: 0, params: {} }]
        ],
        [
            [null, "/test"],
            [{}, "/test"]
        ]
    ],
    [
        "/test/",
        undefined,
        ["/test/"],
        [
            ["/test", null],
            ["/test/", ["/test/"]],
            ["/test//", ["/test//"]]
        ],
        [[null, "/test/"]]
    ],
    /**
     * Case-sensitive paths.
     */
    [
        "/test",
        {
            sensitive: true
        },
        ["/test"],
        [
            ["/test", ["/test"]],
            ["/TEST", null]
        ],
        [[null, "/test"]]
    ],
    [
        "/TEST",
        {
            sensitive: true
        },
        ["/TEST"],
        [
            ["/test", null],
            ["/TEST", ["/TEST"]]
        ],
        [[null, "/TEST"]]
    ],
    /**
     * Strict mode.
     */
    [
        "/test",
        {
            strict: true
        },
        ["/test"],
        [
            ["/test", ["/test"]],
            ["/test/", null],
            ["/TEST", ["/TEST"]]
        ],
        [[null, "/test"]]
    ],
    [
        "/test/",
        {
            strict: true
        },
        ["/test/"],
        [
            ["/test", null],
            ["/test/", ["/test/"]],
            ["/test//", null]
        ],
        [[null, "/test/"]]
    ],
    /**
     * Non-ending mode.
     */
    [
        "/test",
        {
            end: false
        },
        ["/test"],
        [
            ["/test", ["/test"]],
            ["/test/", ["/test/"]],
            ["/test/route", ["/test"]],
            ["/route", null]
        ],
        [[null, "/test"]]
    ],
    [
        "/test/",
        {
            end: false
        },
        ["/test/"],
        [
            ["/test", null],
            ["/test/route", ["/test/"]],
            ["/test//", ["/test//"]],
            ["/test//route", ["/test/"]]
        ],
        [[null, "/test/"]]
    ],
    [
        "/:test",
        {
            end: false
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            [
                "/route",
                ["/route", "route"],
                { path: "/route", index: 0, params: { test: "route" } }
            ],
            [
                "/caf%C3%A9",
                ["/caf%C3%A9", "caf%C3%A9"],
                { path: "/caf%C3%A9", index: 0, params: { test: "caf%C3%A9" } }
            ],
            [
                "/caf%C3%A9",
                ["/caf%C3%A9", "caf%C3%A9"],
                { path: "/caf%C3%A9", index: 0, params: { test: "café" } },
                { decode: decodeURIComponent }
            ]
        ],
        [
            [{}, null],
            [{ test: "abc" }, "/abc"],
            [{ test: "a+b" }, "/a+b"],
            [{ test: "a+b" }, "/test", { encode: function (_, token) { return String(token.name); } }],
            [{ test: "a+b" }, "/a%2Bb", { encode: encodeURIComponent }]
        ]
    ],
    [
        "/:test/",
        {
            end: false
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            "/"
        ],
        [
            ["/route", null],
            ["/route/", ["/route/", "route"]]
        ],
        [[{ test: "abc" }, "/abc/"]]
    ],
    [
        "",
        {
            end: false
        },
        [],
        [
            ["", [""]],
            ["/", ["/"]],
            ["route", [""]],
            ["/route", [""]],
            ["/route/", [""]]
        ],
        [[null, ""]]
    ],
    /**
     * Non-starting mode.
     */
    [
        "/test",
        {
            start: false
        },
        ["/test"],
        [
            ["/test", ["/test"]],
            ["/test/", ["/test/"]],
            ["/route/test", ["/test"]],
            ["/test/route", null],
            ["/route/test/deep", null],
            ["/route", null]
        ],
        [[null, "/test"]]
    ],
    [
        "/test/",
        {
            start: false
        },
        ["/test/"],
        [
            ["/test", null],
            ["/test/route", null],
            ["/test//route", null],
            ["/test//", ["/test//"]],
            ["/route/test/", ["/test/"]]
        ],
        [[null, "/test/"]]
    ],
    [
        "/:test",
        {
            start: false
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [["/route", ["/route", "route"]]],
        [
            [{}, null],
            [{ test: "abc" }, "/abc"],
            [{ test: "a+b" }, "/a+b"],
            [{ test: "a+b" }, "/test", { encode: function (_, token) { return String(token.name); } }],
            [{ test: "a+b" }, "/a%2Bb", { encode: encodeURIComponent }]
        ]
    ],
    [
        "/:test/",
        {
            start: false
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            "/"
        ],
        [
            ["/route", null],
            ["/route/", ["/route/", "route"]]
        ],
        [[{ test: "abc" }, "/abc/"]]
    ],
    [
        "",
        {
            start: false
        },
        [],
        [
            ["", [""]],
            ["/", ["/"]],
            ["route", [""]],
            ["/route", [""]],
            ["/route/", ["/"]]
        ],
        [[null, ""]]
    ],
    /**
     * Combine modes.
     */
    [
        "/test",
        {
            end: false,
            strict: true
        },
        ["/test"],
        [
            ["/test", ["/test"]],
            ["/test/", ["/test"]],
            ["/test/route", ["/test"]]
        ],
        [[null, "/test"]]
    ],
    [
        "/test/",
        {
            end: false,
            strict: true
        },
        ["/test/"],
        [
            ["/test", null],
            ["/test/", ["/test/"]],
            ["/test//", ["/test/"]],
            ["/test/route", ["/test/"]]
        ],
        [[null, "/test/"]]
    ],
    [
        "/test.json",
        {
            end: false,
            strict: true
        },
        ["/test.json"],
        [
            ["/test.json", ["/test.json"]],
            ["/test.json.hbs", null],
            ["/test.json/route", ["/test.json"]]
        ],
        [[null, "/test.json"]]
    ],
    [
        "/:test",
        {
            end: false,
            strict: true
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/route", ["/route", "route"]],
            ["/route/", ["/route", "route"]]
        ],
        [
            [{}, null],
            [{ test: "abc" }, "/abc"]
        ]
    ],
    [
        "/:test/",
        {
            end: false,
            strict: true
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            "/"
        ],
        [
            ["/route", null],
            ["/route/", ["/route/", "route"]]
        ],
        [[{ test: "foobar" }, "/foobar/"]]
    ],
    [
        "/test",
        {
            start: false,
            end: false
        },
        ["/test"],
        [
            ["/test", ["/test"]],
            ["/test/", ["/test/"]],
            ["/test/route", ["/test"]],
            ["/route/test/deep", ["/test"]]
        ],
        [[null, "/test"]]
    ],
    [
        "/test/",
        {
            start: false,
            end: false
        },
        ["/test/"],
        [
            ["/test", null],
            ["/test/", ["/test/"]],
            ["/test//", ["/test//"]],
            ["/test/route", ["/test/"]],
            ["/route/test/deep", ["/test/"]]
        ],
        [[null, "/test/"]]
    ],
    [
        "/test.json",
        {
            start: false,
            end: false
        },
        ["/test.json"],
        [
            ["/test.json", ["/test.json"]],
            ["/test.json.hbs", null],
            ["/test.json/route", ["/test.json"]],
            ["/route/test.json/deep", ["/test.json"]]
        ],
        [[null, "/test.json"]]
    ],
    [
        "/:test",
        {
            start: false,
            end: false
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/route", ["/route", "route"]],
            ["/route/", ["/route/", "route"]]
        ],
        [
            [{}, null],
            [{ test: "abc" }, "/abc"]
        ]
    ],
    [
        "/:test/",
        {
            end: false,
            strict: true
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            "/"
        ],
        [
            ["/route", null],
            ["/route/", ["/route/", "route"]]
        ],
        [[{ test: "foobar" }, "/foobar/"]]
    ],
    /**
     * Arrays of simple paths.
     */
    [
        ["/one", "/two"],
        undefined,
        [],
        [
            ["/one", ["/one"]],
            ["/two", ["/two"]],
            ["/three", null],
            ["/one/two", null]
        ],
        []
    ],
    /**
     * Non-ending simple path.
     */
    [
        "/test",
        {
            end: false
        },
        ["/test"],
        [["/test/route", ["/test"]]],
        [[null, "/test"]]
    ],
    /**
     * Single named parameter.
     */
    [
        "/:test",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/route", ["/route", "route"]],
            ["/another", ["/another", "another"]],
            ["/something/else", null],
            ["/route.json", ["/route.json", "route.json"]],
            ["/something%2Felse", ["/something%2Felse", "something%2Felse"]],
            [
                "/something%2Felse%2Fmore",
                ["/something%2Felse%2Fmore", "something%2Felse%2Fmore"]
            ],
            ["/;,:@&=+$-_.!~*()", ["/;,:@&=+$-_.!~*()", ";,:@&=+$-_.!~*()"]]
        ],
        [
            [{ test: "route" }, "/route"],
            [
                { test: "something/else" },
                "/something%2Felse",
                { encode: encodeURIComponent }
            ],
            [
                { test: "something/else/more" },
                "/something%2Felse%2Fmore",
                { encode: encodeURIComponent }
            ]
        ]
    ],
    [
        "/:test",
        {
            strict: true
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/route", ["/route", "route"]],
            ["/route/", null]
        ],
        [[{ test: "route" }, "/route"]]
    ],
    [
        "/:test/",
        {
            strict: true
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            "/"
        ],
        [
            ["/route/", ["/route/", "route"]],
            ["/route//", null]
        ],
        [[{ test: "route" }, "/route/"]]
    ],
    [
        "/:test",
        {
            end: false
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/route.json", ["/route.json", "route.json"]],
            ["/route//", ["/route", "route"]]
        ],
        [[{ test: "route" }, "/route"]]
    ],
    /**
     * Optional named parameter.
     */
    [
        "/:test?",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            [
                "/route",
                ["/route", "route"],
                { path: "/route", index: 0, params: { test: "route" } }
            ],
            ["/route/nested", null, false],
            ["/", ["/", undefined], { path: "/", index: 0, params: {} }],
            ["//", null]
        ],
        [
            [null, ""],
            [{ test: "foobar" }, "/foobar"]
        ]
    ],
    [
        "/:test?",
        {
            strict: true
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/route", ["/route", "route"]],
            ["/", null],
            ["//", null]
        ],
        [
            [null, ""],
            [{ test: "foobar" }, "/foobar"]
        ]
    ],
    [
        "/:test?/",
        {
            strict: true
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            },
            "/"
        ],
        [
            ["/route", null],
            ["/route/", ["/route/", "route"]],
            ["/", ["/", undefined]],
            ["//", null]
        ],
        [
            [null, "/"],
            [{ test: "foobar" }, "/foobar/"]
        ]
    ],
    [
        "/:test?/bar",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            },
            "/bar"
        ],
        [
            ["/bar", ["/bar", undefined]],
            ["/foo/bar", ["/foo/bar", "foo"]]
        ],
        [
            [null, "/bar"],
            [{ test: "foo" }, "/foo/bar"]
        ]
    ],
    [
        "/:test?-bar",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            },
            "-bar"
        ],
        [
            ["-bar", ["-bar", undefined]],
            ["/-bar", null],
            ["/foo-bar", ["/foo-bar", "foo"]]
        ],
        [
            [undefined, "-bar"],
            [{ test: "foo" }, "/foo-bar"]
        ]
    ],
    [
        "/:test*-bar",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "*",
                pattern: "[^\\/#\\?]+?"
            },
            "-bar"
        ],
        [
            ["-bar", ["-bar", undefined]],
            ["/-bar", null],
            ["/foo-bar", ["/foo-bar", "foo"]],
            ["/foo/baz-bar", ["/foo/baz-bar", "foo/baz"]]
        ],
        [[{ test: "foo" }, "/foo-bar"]]
    ],
    /**
     * Repeated one or more times parameters.
     */
    [
        "/:test+",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "+",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/", null, false],
            [
                "/route",
                ["/route", "route"],
                { path: "/route", index: 0, params: { test: ["route"] } }
            ],
            [
                "/some/basic/route",
                ["/some/basic/route", "some/basic/route"],
                {
                    path: "/some/basic/route",
                    index: 0,
                    params: { test: ["some", "basic", "route"] }
                }
            ],
            ["//", null, false]
        ],
        [
            [{}, null],
            [{ test: "foobar" }, "/foobar"],
            [{ test: ["a", "b", "c"] }, "/a/b/c"]
        ]
    ],
    [
        "/:test(\\d+)+",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "+",
                pattern: "\\d+"
            }
        ],
        [
            ["/abc/456/789", null],
            ["/123/456/789", ["/123/456/789", "123/456/789"]]
        ],
        [
            [{ test: "abc" }, null],
            [{ test: 123 }, "/123"],
            [{ test: [1, 2, 3] }, "/1/2/3"]
        ]
    ],
    [
        "/route.:ext(json|xml)+",
        undefined,
        [
            "/route",
            {
                name: "ext",
                prefix: ".",
                suffix: "",
                modifier: "+",
                pattern: "json|xml"
            }
        ],
        [
            ["/route", null],
            ["/route.json", ["/route.json", "json"]],
            ["/route.xml.json", ["/route.xml.json", "xml.json"]],
            ["/route.html", null]
        ],
        [
            [{ ext: "foobar" }, null],
            [{ ext: "xml" }, "/route.xml"],
            [{ ext: ["xml", "json"] }, "/route.xml.json"]
        ]
    ],
    [
        "/route.:ext(\\w+)/test",
        undefined,
        [
            "/route",
            {
                name: "ext",
                prefix: ".",
                suffix: "",
                modifier: "",
                pattern: "\\w+"
            },
            "/test"
        ],
        [
            ["/route", null],
            ["/route.json", null],
            ["/route.xml/test", ["/route.xml/test", "xml"]],
            ["/route.json.gz/test", null]
        ],
        [[{ ext: "xml" }, "/route.xml/test"]]
    ],
    /**
     * Repeated zero or more times parameters.
     */
    [
        "/:test*",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "*",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/", ["/", undefined], { path: "/", index: 0, params: {} }],
            ["//", null, false],
            [
                "/route",
                ["/route", "route"],
                { path: "/route", index: 0, params: { test: ["route"] } }
            ],
            [
                "/some/basic/route",
                ["/some/basic/route", "some/basic/route"],
                {
                    path: "/some/basic/route",
                    index: 0,
                    params: { test: ["some", "basic", "route"] }
                }
            ]
        ],
        [
            [{}, ""],
            [{ test: [] }, ""],
            [{ test: "foobar" }, "/foobar"],
            [{ test: ["foo", "bar"] }, "/foo/bar"]
        ]
    ],
    [
        "/route.:ext([a-z]+)*",
        undefined,
        [
            "/route",
            {
                name: "ext",
                prefix: ".",
                suffix: "",
                modifier: "*",
                pattern: "[a-z]+"
            }
        ],
        [
            ["/route", ["/route", undefined]],
            ["/route.json", ["/route.json", "json"]],
            ["/route.json.xml", ["/route.json.xml", "json.xml"]],
            ["/route.123", null]
        ],
        [
            [{}, "/route"],
            [{ ext: [] }, "/route"],
            [{ ext: "123" }, null],
            [{ ext: "foobar" }, "/route.foobar"],
            [{ ext: ["foo", "bar"] }, "/route.foo.bar"]
        ]
    ],
    /**
     * Custom named parameters.
     */
    [
        "/:test(\\d+)",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "\\d+"
            }
        ],
        [
            ["/123", ["/123", "123"]],
            ["/abc", null],
            ["/123/abc", null]
        ],
        [
            [{ test: "abc" }, null],
            [{ test: "abc" }, "/abc", { validate: false }],
            [{ test: "123" }, "/123"]
        ]
    ],
    [
        "/:test(\\d+)",
        {
            end: false
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "\\d+"
            }
        ],
        [
            ["/123", ["/123", "123"]],
            ["/abc", null],
            ["/123/abc", ["/123", "123"]]
        ],
        [[{ test: "123" }, "/123"]]
    ],
    [
        "/:test(.*)",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: ".*"
            }
        ],
        [
            ["/anything/goes/here", ["/anything/goes/here", "anything/goes/here"]],
            ["/;,:@&=/+$-_.!/~*()", ["/;,:@&=/+$-_.!/~*()", ";,:@&=/+$-_.!/~*()"]]
        ],
        [
            [{ test: "" }, "/"],
            [{ test: "abc" }, "/abc"],
            [{ test: "abc/123" }, "/abc%2F123", { encode: encodeURIComponent }],
            [
                { test: "abc/123/456" },
                "/abc%2F123%2F456",
                { encode: encodeURIComponent }
            ]
        ]
    ],
    [
        "/:route([a-z]+)",
        undefined,
        [
            {
                name: "route",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[a-z]+"
            }
        ],
        [
            ["/abcde", ["/abcde", "abcde"]],
            ["/12345", null]
        ],
        [
            [{ route: "" }, null],
            [{ route: "" }, "/", { validate: false }],
            [{ route: "123" }, null],
            [{ route: "123" }, "/123", { validate: false }],
            [{ route: "abc" }, "/abc"]
        ]
    ],
    [
        "/:route(this|that)",
        undefined,
        [
            {
                name: "route",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "this|that"
            }
        ],
        [
            ["/this", ["/this", "this"]],
            ["/that", ["/that", "that"]],
            ["/foo", null]
        ],
        [
            [{ route: "this" }, "/this"],
            [{ route: "foo" }, null],
            [{ route: "foo" }, "/foo", { validate: false }],
            [{ route: "that" }, "/that"]
        ]
    ],
    [
        "/:path(abc|xyz)*",
        undefined,
        [
            {
                name: "path",
                prefix: "/",
                suffix: "",
                modifier: "*",
                pattern: "abc|xyz"
            }
        ],
        [
            ["/abc", ["/abc", "abc"]],
            ["/abc/abc", ["/abc/abc", "abc/abc"]],
            ["/xyz/xyz", ["/xyz/xyz", "xyz/xyz"]],
            ["/abc/xyz", ["/abc/xyz", "abc/xyz"]],
            ["/abc/xyz/abc/xyz", ["/abc/xyz/abc/xyz", "abc/xyz/abc/xyz"]],
            ["/xyzxyz", null]
        ],
        [
            [{ path: "abc" }, "/abc"],
            [{ path: ["abc", "xyz"] }, "/abc/xyz"],
            [{ path: ["xyz", "abc", "xyz"] }, "/xyz/abc/xyz"],
            [{ path: "abc123" }, null],
            [{ path: "abc123" }, "/abc123", { validate: false }],
            [{ path: "abcxyz" }, null],
            [{ path: "abcxyz" }, "/abcxyz", { validate: false }]
        ]
    ],
    /**
     * Prefixed slashes could be omitted.
     */
    [
        "test",
        undefined,
        ["test"],
        [
            ["test", ["test"]],
            ["/test", null]
        ],
        [[null, "test"]]
    ],
    [
        ":test",
        undefined,
        [
            {
                name: "test",
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["route", ["route", "route"]],
            ["/route", null],
            ["route/", ["route/", "route"]]
        ],
        [
            [{ test: "" }, null],
            [{}, null],
            [{ test: null }, null],
            [{ test: "route" }, "route"]
        ]
    ],
    [
        ":test",
        {
            strict: true
        },
        [
            {
                name: "test",
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["route", ["route", "route"]],
            ["/route", null],
            ["route/", null]
        ],
        [[{ test: "route" }, "route"]]
    ],
    [
        ":test",
        {
            end: false
        },
        [
            {
                name: "test",
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["route", ["route", "route"]],
            ["/route", null],
            ["route/", ["route/", "route"]],
            ["route/foobar", ["route", "route"]]
        ],
        [[{ test: "route" }, "route"]]
    ],
    [
        ":test?",
        undefined,
        [
            {
                name: "test",
                prefix: "",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["route", ["route", "route"]],
            ["/route", null],
            ["", ["", undefined]],
            ["route/foobar", null]
        ],
        [
            [{}, ""],
            [{ test: "" }, null],
            [{ test: "route" }, "route"]
        ]
    ],
    [
        "{:test/}+",
        undefined,
        [
            {
                name: "test",
                prefix: "",
                suffix: "/",
                modifier: "+",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["route/", ["route/", "route"]],
            ["/route", null],
            ["", null],
            ["foo/bar/", ["foo/bar/", "foo/bar"]]
        ],
        [
            [{}, null],
            [{ test: "" }, null],
            [{ test: ["route"] }, "route/"],
            [{ test: ["foo", "bar"] }, "foo/bar/"]
        ]
    ],
    /**
     * Formats.
     */
    [
        "/test.json",
        undefined,
        ["/test.json"],
        [
            ["/test.json", ["/test.json"]],
            ["/route.json", null]
        ],
        [[{}, "/test.json"]]
    ],
    [
        "/:test.json",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            ".json"
        ],
        [
            ["/.json", null],
            ["/test.json", ["/test.json", "test"]],
            ["/route.json", ["/route.json", "route"]],
            ["/route.json.json", ["/route.json.json", "route.json"]]
        ],
        [
            [{ test: "" }, null],
            [{ test: "foo" }, "/foo.json"]
        ]
    ],
    /**
     * Format params.
     */
    [
        "/test.:format(\\w+)",
        undefined,
        [
            "/test",
            {
                name: "format",
                prefix: ".",
                suffix: "",
                modifier: "",
                pattern: "\\w+"
            }
        ],
        [
            ["/test.html", ["/test.html", "html"]],
            ["/test.hbs.html", null]
        ],
        [
            [{}, null],
            [{ format: "" }, null],
            [{ format: "foo" }, "/test.foo"]
        ]
    ],
    [
        "/test.:format(\\w+).:format(\\w+)",
        undefined,
        [
            "/test",
            {
                name: "format",
                prefix: ".",
                suffix: "",
                modifier: "",
                pattern: "\\w+"
            },
            {
                name: "format",
                prefix: ".",
                suffix: "",
                modifier: "",
                pattern: "\\w+"
            }
        ],
        [
            ["/test.html", null],
            ["/test.hbs.html", ["/test.hbs.html", "hbs", "html"]]
        ],
        [
            [{ format: "foo.bar" }, null],
            [{ format: "foo" }, "/test.foo.foo"]
        ]
    ],
    [
        "/test{.:format}+",
        undefined,
        [
            "/test",
            {
                name: "format",
                prefix: ".",
                suffix: "",
                modifier: "+",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/test.html", ["/test.html", "html"]],
            ["/test.hbs.html", ["/test.hbs.html", "hbs.html"]]
        ],
        [
            [{ format: [] }, null],
            [{ format: "foo" }, "/test.foo"],
            [{ format: ["foo", "bar"] }, "/test.foo.bar"]
        ]
    ],
    [
        "/test.:format(\\w+)",
        {
            end: false
        },
        [
            "/test",
            {
                name: "format",
                prefix: ".",
                suffix: "",
                modifier: "",
                pattern: "\\w+"
            }
        ],
        [
            ["/test.html", ["/test.html", "html"]],
            ["/test.hbs.html", null]
        ],
        [[{ format: "foo" }, "/test.foo"]]
    ],
    [
        "/test.:format.",
        undefined,
        [
            "/test",
            {
                name: "format",
                prefix: ".",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            "."
        ],
        [
            ["/test.html.", ["/test.html.", "html"]],
            ["/test.hbs.html", null]
        ],
        [
            [{ format: "" }, null],
            [{ format: "foo" }, "/test.foo."]
        ]
    ],
    /**
     * Format and path params.
     */
    [
        "/:test.:format",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            {
                name: "format",
                prefix: ".",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/route.html", ["/route.html", "route", "html"]],
            ["/route", null],
            ["/route.html.json", ["/route.html.json", "route", "html.json"]]
        ],
        [
            [{}, null],
            [{ test: "route", format: "foo" }, "/route.foo"]
        ]
    ],
    [
        "/:test{.:format}?",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            {
                name: "format",
                prefix: ".",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/route", ["/route", "route", undefined]],
            ["/route.json", ["/route.json", "route", "json"]],
            ["/route.json.html", ["/route.json.html", "route", "json.html"]]
        ],
        [
            [{ test: "route" }, "/route"],
            [{ test: "route", format: "" }, null],
            [{ test: "route", format: "foo" }, "/route.foo"]
        ]
    ],
    [
        "/:test.:format?",
        {
            end: false
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            {
                name: "format",
                prefix: ".",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/route", ["/route", "route", undefined]],
            ["/route.json", ["/route.json", "route", "json"]],
            ["/route.json.html", ["/route.json.html", "route", "json.html"]]
        ],
        [
            [{ test: "route" }, "/route"],
            [{ test: "route", format: undefined }, "/route"],
            [{ test: "route", format: "" }, null],
            [{ test: "route", format: "foo" }, "/route.foo"]
        ]
    ],
    [
        "/test.:format(.*)z",
        {
            end: false
        },
        [
            "/test",
            {
                name: "format",
                prefix: ".",
                suffix: "",
                modifier: "",
                pattern: ".*"
            },
            "z"
        ],
        [
            ["/test.abc", null],
            ["/test.z", ["/test.z", ""]],
            ["/test.abcz", ["/test.abcz", "abc"]]
        ],
        [
            [{}, null],
            [{ format: "" }, "/test.z"],
            [{ format: "foo" }, "/test.fooz"]
        ]
    ],
    /**
     * Unnamed params.
     */
    [
        "/(\\d+)",
        undefined,
        [
            {
                name: 0,
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "\\d+"
            }
        ],
        [
            ["/123", ["/123", "123"]],
            ["/abc", null],
            ["/123/abc", null]
        ],
        [
            [{}, null],
            [{ "0": "123" }, "/123"]
        ]
    ],
    [
        "/(\\d+)",
        {
            end: false
        },
        [
            {
                name: 0,
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "\\d+"
            }
        ],
        [
            ["/123", ["/123", "123"]],
            ["/abc", null],
            ["/123/abc", ["/123", "123"]],
            ["/123/", ["/123/", "123"]]
        ],
        [[{ "0": "123" }, "/123"]]
    ],
    [
        "/(\\d+)?",
        undefined,
        [
            {
                name: 0,
                prefix: "/",
                suffix: "",
                modifier: "?",
                pattern: "\\d+"
            }
        ],
        [
            ["/", ["/", undefined]],
            ["/123", ["/123", "123"]]
        ],
        [
            [{}, ""],
            [{ "0": "123" }, "/123"]
        ]
    ],
    [
        "/(.*)",
        undefined,
        [
            {
                name: 0,
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: ".*"
            }
        ],
        [
            ["/", ["/", ""]],
            ["/route", ["/route", "route"]],
            ["/route/nested", ["/route/nested", "route/nested"]]
        ],
        [
            [{ "0": "" }, "/"],
            [{ "0": "123" }, "/123"]
        ]
    ],
    [
        "/route\\(\\\\(\\d+\\\\)\\)",
        undefined,
        [
            "/route(\\",
            {
                name: 0,
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: "\\d+\\\\"
            },
            ")"
        ],
        [["/route(\\123\\)", ["/route(\\123\\)", "123\\"]]],
        []
    ],
    [
        "{/login}?",
        undefined,
        [
            {
                name: "",
                prefix: "/login",
                suffix: "",
                modifier: "?",
                pattern: ""
            }
        ],
        [
            ["/", ["/"]],
            ["/login", ["/login"]]
        ],
        [
            [null, ""],
            [{ "": "" }, "/login"]
        ]
    ],
    [
        "{/login}",
        undefined,
        [
            {
                name: "",
                prefix: "/login",
                suffix: "",
                modifier: "",
                pattern: ""
            }
        ],
        [
            ["/", null],
            ["/login", ["/login"]]
        ],
        [[{ "": "" }, "/login"]]
    ],
    [
        "{/(.*)}",
        undefined,
        [
            {
                name: 0,
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: ".*"
            }
        ],
        [
            ["/", ["/", ""]],
            ["/login", ["/login", "login"]]
        ],
        [[{ 0: "test" }, "/test"]]
    ],
    /**
     * Regexps.
     */
    [/.*/, undefined, [], [["/match/anything", ["/match/anything"]]], []],
    [
        /(.*)/,
        undefined,
        [
            {
                name: 0,
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: ""
            }
        ],
        [["/match/anything", ["/match/anything", "/match/anything"]]],
        []
    ],
    [
        /\/(\d+)/,
        undefined,
        [
            {
                name: 0,
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: ""
            }
        ],
        [
            ["/abc", null],
            ["/123", ["/123", "123"]]
        ],
        []
    ],
    /**
     * Mixed arrays.
     */
    [
        ["/test", /\/(\d+)/],
        undefined,
        [
            {
                name: 0,
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: ""
            }
        ],
        [["/test", ["/test", undefined]]],
        []
    ],
    [
        ["/:test(\\d+)", /(.*)/],
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "\\d+"
            },
            {
                name: 0,
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: ""
            }
        ],
        [
            ["/123", ["/123", "123", undefined]],
            ["/abc", ["/abc", undefined, "/abc"]]
        ],
        []
    ],
    /**
     * Correct names and indexes.
     */
    [
        ["/:test", "/route/:test"],
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/test", ["/test", "test", undefined]],
            ["/route/test", ["/route/test", undefined, "test"]]
        ],
        []
    ],
    [
        [/^\/([^\/]+)$/, /^\/route\/([^\/]+)$/],
        undefined,
        [
            {
                name: 0,
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: ""
            },
            {
                name: 0,
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: ""
            }
        ],
        [
            ["/test", ["/test", "test", undefined]],
            ["/route/test", ["/route/test", undefined, "test"]]
        ],
        []
    ],
    /**
     * Ignore non-matching groups in regexps.
     */
    [
        /(?:.*)/,
        undefined,
        [],
        [["/anything/you/want", ["/anything/you/want"]]],
        []
    ],
    /**
     * Respect escaped characters.
     */
    [
        "/\\(testing\\)",
        undefined,
        ["/(testing)"],
        [
            ["/testing", null],
            ["/(testing)", ["/(testing)"]]
        ],
        [[null, "/(testing)"]]
    ],
    [
        "/.\\+\\*\\?\\{\\}=^!\\:$[]|",
        undefined,
        ["/.+*?{}=^!:$[]|"],
        [["/.+*?{}=^!:$[]|", ["/.+*?{}=^!:$[]|"]]],
        [[null, "/.+*?{}=^!:$[]|"]]
    ],
    [
        "/test\\/:uid(u\\d+)?:cid(c\\d+)?",
        undefined,
        [
            "/test/",
            {
                name: "uid",
                prefix: "",
                suffix: "",
                modifier: "?",
                pattern: "u\\d+"
            },
            {
                name: "cid",
                prefix: "",
                suffix: "",
                modifier: "?",
                pattern: "c\\d+"
            }
        ],
        [
            ["/test", null],
            ["/test/", ["/test/", undefined, undefined]],
            ["/test/u123", ["/test/u123", "u123", undefined]],
            ["/test/c123", ["/test/c123", undefined, "c123"]]
        ],
        [
            [{ uid: "u123" }, "/test/u123"],
            [{ cid: "c123" }, "/test/c123"],
            [{ cid: "u123" }, null]
        ]
    ],
    /**
     * Unnamed group prefix.
     */
    [
        "/{apple-}?icon-:res(\\d+).png",
        undefined,
        [
            "/",
            {
                name: "",
                prefix: "apple-",
                suffix: "",
                modifier: "?",
                pattern: ""
            },
            "icon-",
            {
                name: "res",
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: "\\d+"
            },
            ".png"
        ],
        [
            ["/icon-240.png", ["/icon-240.png", "240"]],
            ["/apple-icon-240.png", ["/apple-icon-240.png", "240"]]
        ],
        []
    ],
    /**
     * Random examples.
     */
    [
        "/:foo/:bar",
        undefined,
        [
            {
                name: "foo",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            {
                name: "bar",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [["/match/route", ["/match/route", "match", "route"]]],
        [[{ foo: "a", bar: "b" }, "/a/b"]]
    ],
    [
        "/:foo\\(test\\)/bar",
        undefined,
        [
            {
                name: "foo",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            "(test)/bar"
        ],
        [],
        []
    ],
    [
        "/:remote([\\w-.]+)/:user([\\w-]+)",
        undefined,
        [
            {
                name: "remote",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[\\w-.]+"
            },
            {
                name: "user",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[\\w-]+"
            }
        ],
        [
            ["/endpoint/user", ["/endpoint/user", "endpoint", "user"]],
            ["/endpoint/user-name", ["/endpoint/user-name", "endpoint", "user-name"]],
            ["/foo.bar/user-name", ["/foo.bar/user-name", "foo.bar", "user-name"]]
        ],
        [
            [{ remote: "foo", user: "bar" }, "/foo/bar"],
            [{ remote: "foo.bar", user: "uno" }, "/foo.bar/uno"]
        ]
    ],
    [
        "/:foo\\?",
        undefined,
        [
            {
                name: "foo",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            "?"
        ],
        [["/route?", ["/route?", "route"]]],
        [[{ foo: "bar" }, "/bar?"]]
    ],
    [
        "/:foo+baz",
        undefined,
        [
            {
                name: "foo",
                prefix: "/",
                suffix: "",
                modifier: "+",
                pattern: "[^\\/#\\?]+?"
            },
            "baz"
        ],
        [
            ["/foobaz", ["/foobaz", "foo"]],
            ["/foo/barbaz", ["/foo/barbaz", "foo/bar"]],
            ["/baz", null]
        ],
        [
            [{ foo: "foo" }, "/foobaz"],
            [{ foo: "foo/bar" }, "/foo%2Fbarbaz", { encode: encodeURIComponent }],
            [{ foo: ["foo", "bar"] }, "/foo/barbaz"]
        ]
    ],
    [
        "\\/:pre?baz",
        undefined,
        [
            "/",
            {
                name: "pre",
                prefix: "",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            },
            "baz"
        ],
        [
            ["/foobaz", ["/foobaz", "foo"]],
            ["/baz", ["/baz", undefined]]
        ],
        [
            [{}, "/baz"],
            [{ pre: "foo" }, "/foobaz"]
        ]
    ],
    [
        "/:foo\\(:bar?\\)",
        undefined,
        [
            {
                name: "foo",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            "(",
            {
                name: "bar",
                prefix: "",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            },
            ")"
        ],
        [
            ["/hello(world)", ["/hello(world)", "hello", "world"]],
            ["/hello()", ["/hello()", "hello", undefined]]
        ],
        [
            [{ foo: "hello", bar: "world" }, "/hello(world)"],
            [{ foo: "hello" }, "/hello()"]
        ]
    ],
    [
        "/:postType(video|audio|text)(\\+.+)?",
        undefined,
        [
            {
                name: "postType",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "video|audio|text"
            },
            {
                name: 0,
                prefix: "",
                suffix: "",
                modifier: "?",
                pattern: "\\+.+"
            }
        ],
        [
            ["/video", ["/video", "video", undefined]],
            ["/video+test", ["/video+test", "video", "+test"]],
            ["/video+", null]
        ],
        [
            [{ postType: "video" }, "/video"],
            [{ postType: "random" }, null]
        ]
    ],
    [
        "/:foo?/:bar?-ext",
        undefined,
        [
            {
                name: "foo",
                prefix: "/",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            },
            {
                name: "bar",
                prefix: "/",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            },
            "-ext"
        ],
        [
            ["/-ext", null],
            ["-ext", ["-ext", undefined, undefined]],
            ["/foo-ext", ["/foo-ext", "foo", undefined]],
            ["/foo/bar-ext", ["/foo/bar-ext", "foo", "bar"]],
            ["/foo/-ext", null]
        ],
        [
            [{}, "-ext"],
            [{ foo: "foo" }, "/foo-ext"],
            [{ bar: "bar" }, "/bar-ext"],
            [{ foo: "foo", bar: "bar" }, "/foo/bar-ext"]
        ]
    ],
    [
        "/:required/:optional?-ext",
        undefined,
        [
            {
                name: "required",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            {
                name: "optional",
                prefix: "/",
                suffix: "",
                modifier: "?",
                pattern: "[^\\/#\\?]+?"
            },
            "-ext"
        ],
        [
            ["/foo-ext", ["/foo-ext", "foo", undefined]],
            ["/foo/bar-ext", ["/foo/bar-ext", "foo", "bar"]],
            ["/foo/-ext", null]
        ],
        [[{ required: "foo" }, "/foo-ext"]]
    ],
    /**
     * Unicode characters.
     */
    [
        "/:foo",
        undefined,
        [
            {
                name: "foo",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [["/café", ["/café", "café"]]],
        [
            [{ foo: "café" }, "/café"],
            [{ foo: "café" }, "/caf%C3%A9", { encode: encodeURIComponent }]
        ]
    ],
    ["/café", undefined, ["/café"], [["/café", ["/café"]]], [[null, "/café"]]],
    [
        "/café",
        { encode: encodeURI },
        ["/café"],
        [["/caf%C3%A9", ["/caf%C3%A9"]]],
        [[null, "/café"]]
    ],
    [
        "packages/",
        undefined,
        ["packages/"],
        [
            ["packages", null],
            ["packages/", ["packages/"]]
        ],
        [[null, "packages/"]]
    ],
    /**
     * Hostnames.
     */
    [
        ":domain.com",
        {
            delimiter: "."
        },
        [
            {
                name: "domain",
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: "[^\\.]+?"
            },
            ".com"
        ],
        [
            ["example.com", ["example.com", "example"]],
            ["github.com", ["github.com", "github"]]
        ],
        [
            [{ domain: "example" }, "example.com"],
            [{ domain: "github" }, "github.com"]
        ]
    ],
    [
        "mail.:domain.com",
        {
            delimiter: "."
        },
        [
            "mail",
            {
                name: "domain",
                prefix: ".",
                suffix: "",
                modifier: "",
                pattern: "[^\\.]+?"
            },
            ".com"
        ],
        [
            ["mail.example.com", ["mail.example.com", "example"]],
            ["mail.github.com", ["mail.github.com", "github"]]
        ],
        [
            [{ domain: "example" }, "mail.example.com"],
            [{ domain: "github" }, "mail.github.com"]
        ]
    ],
    [
        "example.:ext",
        {},
        [
            "example",
            {
                name: "ext",
                prefix: ".",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["example.com", ["example.com", "com"]],
            ["example.org", ["example.org", "org"]]
        ],
        [
            [{ ext: "com" }, "example.com"],
            [{ ext: "org" }, "example.org"]
        ]
    ],
    [
        "this is",
        {
            delimiter: " ",
            end: false
        },
        ["this is"],
        [
            ["this is a test", ["this is"]],
            ["this isn't", null]
        ],
        [[null, "this is"]]
    ],
    /**
     * Ends with.
     */
    [
        "/test",
        {
            endsWith: "?"
        },
        ["/test"],
        [
            ["/test", ["/test"]],
            ["/test?query=string", ["/test"]],
            ["/test/?query=string", ["/test/"]],
            ["/testx", null]
        ],
        [[null, "/test"]]
    ],
    [
        "/test",
        {
            endsWith: "?",
            strict: true
        },
        ["/test"],
        [
            ["/test?query=string", ["/test"]],
            ["/test/?query=string", null]
        ],
        [[null, "/test"]]
    ],
    /**
     * Custom prefixes.
     */
    [
        "{$:foo}{$:bar}?",
        {},
        [
            {
                name: "foo",
                pattern: "[^\\/#\\?]+?",
                prefix: "$",
                suffix: "",
                modifier: ""
            },
            {
                name: "bar",
                pattern: "[^\\/#\\?]+?",
                prefix: "$",
                suffix: "",
                modifier: "?"
            }
        ],
        [
            ["$x", ["$x", "x", undefined]],
            ["$x$y", ["$x$y", "x", "y"]]
        ],
        [
            [{ foo: "foo" }, "$foo"],
            [{ foo: "foo", bar: "bar" }, "$foo$bar"]
        ]
    ],
    [
        "name/:attr1?{-:attr2}?{-:attr3}?",
        {},
        [
            "name",
            {
                name: "attr1",
                pattern: "[^\\/#\\?]+?",
                prefix: "/",
                suffix: "",
                modifier: "?"
            },
            {
                name: "attr2",
                pattern: "[^\\/#\\?]+?",
                prefix: "-",
                suffix: "",
                modifier: "?"
            },
            {
                name: "attr3",
                pattern: "[^\\/#\\?]+?",
                prefix: "-",
                suffix: "",
                modifier: "?"
            }
        ],
        [
            ["name/test", ["name/test", "test", undefined, undefined]],
            ["name/1", ["name/1", "1", undefined, undefined]],
            ["name/1-2", ["name/1-2", "1", "2", undefined]],
            ["name/1-2-3", ["name/1-2-3", "1", "2", "3"]],
            ["name/foo-bar/route", null],
            ["name/test/route", null]
        ],
        [
            [{}, "name"],
            [{ attr1: "test" }, "name/test"],
            [{ attr2: "attr" }, "name-attr"]
        ]
    ],
    /**
     * Case-sensitive compile tokensToFunction params.
     */
    [
        "/:test(abc)",
        {
            sensitive: true
        },
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "abc"
            }
        ],
        [
            ["/abc", ["/abc", "abc"]],
            ["/ABC", null]
        ],
        [
            [{ test: "abc" }, "/abc"],
            [{ test: "ABC" }, null]
        ]
    ],
    [
        "/:test(abc)",
        {},
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "abc"
            }
        ],
        [
            ["/abc", ["/abc", "abc"]],
            ["/ABC", ["/ABC", "ABC"]]
        ],
        [
            [{ test: "abc" }, "/abc"],
            [{ test: "ABC" }, "/ABC"]
        ]
    ],
    /**
     * Nested parentheses.
     */
    [
        "/:test(\\d+(?:\\.\\d+)?)",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "\\d+(?:\\.\\d+)?"
            }
        ],
        [
            ["/123", ["/123", "123"]],
            ["/abc", null],
            ["/123/abc", null],
            ["/123.123", ["/123.123", "123.123"]],
            ["/123.abc", null]
        ],
        [
            [{ test: 123 }, "/123"],
            [{ test: 123.123 }, "/123.123"],
            [{ test: "abc" }, null],
            [{ test: "123" }, "/123"],
            [{ test: "123.123" }, "/123.123"],
            [{ test: "123.abc" }, null]
        ]
    ],
    [
        "/:test((?!login)[^/]+)",
        undefined,
        [
            {
                name: "test",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "(?!login)[^/]+"
            }
        ],
        [
            ["/route", ["/route", "route"]],
            ["/login", null]
        ],
        [
            [{ test: "route" }, "/route"],
            [{ test: "login" }, null]
        ]
    ],
    /**
     * https://github.com/pillarjs/path-to-regexp/issues/206
     */
    [
        "/user(s)?/:user",
        undefined,
        [
            "/user",
            {
                name: 0,
                prefix: "",
                suffix: "",
                modifier: "?",
                pattern: "s"
            },
            {
                name: "user",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/user/123", ["/user/123", undefined, "123"]],
            ["/users/123", ["/users/123", "s", "123"]]
        ],
        [[{ user: "123" }, "/user/123"]]
    ],
    /**
     * https://github.com/pillarjs/path-to-regexp/issues/209
     */
    [
        "/whatever/:foo\\?query=str",
        undefined,
        [
            "/whatever",
            {
                name: "foo",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            },
            "?query=str"
        ],
        [["/whatever/123?query=str", ["/whatever/123?query=str", "123"]]],
        [[{ foo: "123" }, "/whatever/123?query=str"]]
    ],
    [
        "/whatever/:foo",
        {
            end: false
        },
        [
            "/whatever",
            {
                name: "foo",
                prefix: "/",
                suffix: "",
                modifier: "",
                pattern: "[^\\/#\\?]+?"
            }
        ],
        [
            ["/whatever/123", ["/whatever/123", "123"]],
            ["/whatever/123/path", ["/whatever/123", "123"]],
            ["/whatever/123#fragment", ["/whatever/123", "123"]],
            ["/whatever/123?query=str", ["/whatever/123", "123"]]
        ],
        [
            [{ foo: "123" }, "/whatever/123"],
            [{ foo: "#" }, null]
        ]
    ]
];
/**
 * Dynamically generate the entire test suite.
 */
describe("path-to-regexp", function () {
    var TEST_PATH = "/user/:id";
    var TEST_PARAM = {
        name: "id",
        prefix: "/",
        suffix: "",
        modifier: "",
        pattern: "[^\\/#\\?]+?"
    };
    describe("arguments", function () {
        it("should work without different call combinations", function () {
            pathToRegexp.pathToRegexp("/test");
            pathToRegexp.pathToRegexp("/test", []);
            pathToRegexp.pathToRegexp("/test", undefined, {});
            pathToRegexp.pathToRegexp(/^\/test/);
            pathToRegexp.pathToRegexp(/^\/test/, []);
            pathToRegexp.pathToRegexp(/^\/test/, undefined, {});
            pathToRegexp.pathToRegexp(["/a", "/b"]);
            pathToRegexp.pathToRegexp(["/a", "/b"], []);
            pathToRegexp.pathToRegexp(["/a", "/b"], undefined, {});
        });
        it("should accept an array of keys as the second argument", function () {
            var keys = [];
            var re = pathToRegexp.pathToRegexp(TEST_PATH, keys, { end: false });
            expect(keys).toEqual([TEST_PARAM]);
            expect(exec(re, "/user/123/show")).toEqual(["/user/123", "123"]);
        });
        it("should throw on non-capturing pattern", function () {
            expect(function () {
                pathToRegexp.pathToRegexp("/:foo(?:\\d+(\\.\\d+)?)");
            }).toThrow(new TypeError('Pattern cannot start with "?" at 6'));
        });
        it("should throw on nested capturing group", function () {
            expect(function () {
                pathToRegexp.pathToRegexp("/:foo(\\d+(\\.\\d+)?)");
            }).toThrow(new TypeError("Capturing groups are not allowed at 9"));
        });
        it("should throw on unbalanced pattern", function () {
            expect(function () {
                pathToRegexp.pathToRegexp("/:foo(abc");
            }).toThrow(new TypeError("Unbalanced pattern at 5"));
        });
        it("should throw on missing pattern", function () {
            expect(function () {
                pathToRegexp.pathToRegexp("/:foo()");
            }).toThrow(new TypeError("Missing pattern at 5"));
        });
        it("should throw on missing name", function () {
            expect(function () {
                pathToRegexp.pathToRegexp("/:(test)");
            }).toThrow(new TypeError("Missing parameter name at 1"));
        });
        it("should throw on nested groups", function () {
            expect(function () {
                pathToRegexp.pathToRegexp("/{a{b:foo}}");
            }).toThrow(new TypeError("Unexpected OPEN at 3, expected CLOSE"));
        });
        it("should throw on misplaced modifier", function () {
            expect(function () {
                pathToRegexp.pathToRegexp("/foo?");
            }).toThrow(new TypeError("Unexpected MODIFIER at 4, expected END"));
        });
    });
    describe("tokens", function () {
        var tokens = pathToRegexp.parse(TEST_PATH);
        it("should expose method to compile tokens to regexp", function () {
            var re = pathToRegexp.tokensToRegexp(tokens);
            expect(exec(re, "/user/123")).toEqual(["/user/123", "123"]);
        });
        it("should expose method to compile tokens to a path function", function () {
            var fn = pathToRegexp.tokensToFunction(tokens);
            expect(fn({ id: 123 })).toEqual("/user/123");
        });
    });
    describe("rules", function () {
        TESTS.forEach(function (test) {
            var path = test[0], opts = test[1], tokens = test[2], matchCases = test[3], compileCases = test[4];
            describe(util.inspect(path), function () {
                var keys = [];
                var re = pathToRegexp.pathToRegexp(path, keys, opts);
                // Parsing and compiling is only supported with string input.
                if (typeof path === "string") {
                    it("should parse", function () {
                        expect(pathToRegexp.parse(path, opts)).toEqual(tokens);
                    });
                    describe("compile", function () {
                        compileCases.forEach(function (io) {
                            var params = io[0], result = io[1], options = io[2];
                            var toPath = pathToRegexp.compile(path, __assign(__assign({}, opts), options));
                            if (result !== null) {
                                it("should compile using " + util.inspect(params), function () {
                                    expect(toPath(params)).toEqual(result);
                                });
                            }
                            else {
                                it("should not compile using " + util.inspect(params), function () {
                                    expect(function () {
                                        toPath(params);
                                    }).toThrow(TypeError);
                                });
                            }
                        });
                    });
                }
                else {
                    it("should parse keys", function () {
                        expect(keys).toEqual(tokens.filter(function (token) {
                            return typeof token !== "string";
                        }));
                    });
                }
                describe("match" + (opts ? " using " + util.inspect(opts) : ""), function () {
                    matchCases.forEach(function (io) {
                        var pathname = io[0], matches = io[1], params = io[2], options = io[3];
                        var message = "should " + (matches ? "" : "not ") + "match " + util.inspect(pathname);
                        it(message, function () {
                            expect(exec(re, pathname)).toEqual(matches);
                        });
                        if (typeof path === "string" && params !== undefined) {
                            var match_1 = pathToRegexp.match(path, options);
                            it(message + " params", function () {
                                expect(match_1(pathname)).toEqual(params);
                            });
                        }
                    });
                });
            });
        });
    });
    describe("compile errors", function () {
        it("should throw when a required param is undefined", function () {
            var toPath = pathToRegexp.compile("/a/:b/c");
            expect(function () {
                toPath();
            }).toThrow(new TypeError('Expected "b" to be a string'));
        });
        it("should throw when it does not match the pattern", function () {
            var toPath = pathToRegexp.compile("/:foo(\\d+)");
            expect(function () {
                toPath({ foo: "abc" });
            }).toThrow(new TypeError('Expected "foo" to match "\\d+", but got "abc"'));
        });
        it("should throw when expecting a repeated value", function () {
            var toPath = pathToRegexp.compile("/:foo+");
            expect(function () {
                toPath({ foo: [] });
            }).toThrow(new TypeError('Expected "foo" to not be empty'));
        });
        it("should throw when not expecting a repeated value", function () {
            var toPath = pathToRegexp.compile("/:foo");
            expect(function () {
                toPath({ foo: [] });
            }).toThrow(new TypeError('Expected "foo" to not repeat, but got an array'));
        });
        it("should throw when repeated value does not match", function () {
            var toPath = pathToRegexp.compile("/:foo(\\d+)+");
            expect(function () {
                toPath({ foo: [1, 2, 3, "a"] });
            }).toThrow(new TypeError('Expected all "foo" to match "\\d+", but got "a"'));
        });
    });
});
/**
 * Execute a regular expression and return a flat array for comparison.
 *
 * @param  {RegExp} re
 * @param  {String} str
 * @return {Array}
 */
function exec(re, str) {
    var match = re.exec(str);
    return match && Array.prototype.slice.call(match);
}
//# sourceMappingURL=index.spec.js.map