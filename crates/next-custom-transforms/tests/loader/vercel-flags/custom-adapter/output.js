import { unstable_flag } from '@vercel/flags/next';
export var myFlag = unstable_flag(customAdapter({
    decide: function() {
        return false;
    },
    key: "myFlag"
}));
