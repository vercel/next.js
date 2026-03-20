import { __turbopack_module_id__ as id } from "../text-dynamic-no-ssr-server" with {
    "turbopackTransition": "next-client-dynamic",
    "turbopackChunkingType": "none"
};
import dynamic from 'next/dynamic';
export const NextDynamicNoSSRServerComponent = dynamic(()=>import('../text-dynamic-no-ssr-server', {
        with: {
            "turbopackTransition": "next-dynamic"
        }
    }), {
    loadableGenerated: {
        modules: [
            id
        ]
    },
    ssr: false
});
