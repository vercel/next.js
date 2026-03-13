import { __turbopack_module_id__ as id } from "../components/hello" with {
    "turbopack-transition": "next-client-dynamic",
    "turbopackChunkingType": "none"
};
import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(()=>import('../components/hello', {
        with: {
            "turbopack-transition": "next-dynamic"
        }
    }), {
    loadableGenerated: {
        modules: [
            id
        ]
    }
});
