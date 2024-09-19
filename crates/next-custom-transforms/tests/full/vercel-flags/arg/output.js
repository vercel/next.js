import { flag as e } from '@vercel/flags/next';
export var myFlag = e({
    decide: function() {
        return !1;
    },
    key: "myFlag"
});
