import { unstable_prefetch } from 'next/cache';
export async function test() {
    await unstable_prefetch();
    return null;
}
