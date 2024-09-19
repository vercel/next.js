import { unstable_flag as flag } from "@vercel/flags/next";
export var myFlag = flag({
    decide: function() {},
    key: "myFlag"
});
