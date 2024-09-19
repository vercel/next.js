import { unstable_flag } from '@vercel/flags/next';
export var myFlag = unstable_flag({
    key: 'custom-key',
    decide: function() {
        return false;
    }
});
