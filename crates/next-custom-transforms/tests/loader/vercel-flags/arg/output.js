import { unstable_flag } from '@vercel/flags/next';
export var myFlag = unstable_flag({
    decide: function() {
        return false;
    },
    key: "myFlag"
});
