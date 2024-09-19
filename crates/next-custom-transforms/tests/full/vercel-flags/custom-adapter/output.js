import { flag as e } from '@vercel/flags/next';
export var myFlag = e(customAdapter({
    decide: function() {
        return !1;
    },
    key: "myFlag"
}));
