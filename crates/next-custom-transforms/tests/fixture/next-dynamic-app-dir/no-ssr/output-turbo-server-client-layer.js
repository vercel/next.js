import { __turbopack_module_id__ as id } from "../text-dynamic-no-ssr-server" with {
    "turbopack-transition": "next-client-dynamic",
    "turbopack-chunking-type": "none"
};
import dynamic from 'next/dynamic';
export const NextDynamicNoSSRServerComponent = dynamic(()=>import('../text-dynamic-no-ssr-server', {
        with: {
            "turbopack-transition": "next-dynamic"
        }
    }), {
    loadableGenerated: {
        modules: [
            id
        ]
    },
    ssr: false
});
