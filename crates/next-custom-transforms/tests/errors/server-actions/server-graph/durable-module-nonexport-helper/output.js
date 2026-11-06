import 'next/cache';
async function helper() {
    void 0;
    return 'helper';
}
export async function cached() {
    return helper();
}
export const expression = async ()=>void 0;
