// Parenthesized directive-shaped strings are not directives: they are
// ordinary expressions and must be ignored, wherever they appear.
export async function foo() {
    ;
    'use client';
}
export function bar() {
    if (true) {
        ;
        'use server';
        'use cache: remote';
    }
    return 'use cache';
}
