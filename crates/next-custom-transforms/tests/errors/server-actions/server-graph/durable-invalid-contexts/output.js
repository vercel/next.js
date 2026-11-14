import 'next/cache';
import * as cache from 'next/cache';
void 0;
export function normal() {
    void 0;
}
export async function normalAsync() {
    void 0;
}
export async function cached() {
    const callback = ()=>{
        void 0;
    };
    return callback();
}
export const expression = async ()=>void 0;
export async function nestedAccessors() {
    return {
        get value () {
            void 0;
            return 'value';
        },
        set value (value){
            void 0;
        }
    };
}
export async function nestedClass() {
    return class {
        value = void 0;
        static{
            void 0;
        }
    };
}
export async function withArguments() {
    void 0;
}
export const methods = {
    async cached () {
        void 0;
    },
    async action () {
        void 0;
    },
    normal () {
        void 0;
    }
};
export class Methods {
    async cached() {
        'use cache';
        unstable_cacheDurable();
    }
    async action() {
        'use server';
        unstable_cacheDurable();
    }
    normal() {
        void 0;
    }
}
