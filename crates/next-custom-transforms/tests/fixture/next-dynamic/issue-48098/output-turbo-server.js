import { __turbopack_module_id__ as id } from "../text-dynamic-no-ssr-server" with {
    "turbopack-transition": "next-client-dynamic",
    "turbopack-chunking-type": "none"
};
import dynamic from 'next/dynamic';
export const NextDynamicNoSSRServerComponent = dynamic(async ()=>{}, {
    loadableGenerated: {
        modules: [
            id
        ]
    },
    ssr: false
});
