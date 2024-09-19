import { flag as e } from '@vercel/flags/next';
export var myFlag = e({
    key: 'custom-key',
    decide: function() {
        return !1;
    }
});
