import { __turbopack_module_id__ as id } from "../components/hello" with {
    "turbopackTransition": "next-client-dynamic",
    "turbopackChunkingType": "none"
};
import dynamic from 'next/dynamic';
import somethingElse from 'something-else';
const DynamicComponent = dynamic(()=>import('../components/hello', {
        with: {
            "turbopackTransition": "next-dynamic"
        }
    }), {
    loadableGenerated: {
        modules: [
            id
        ]
    }
});
somethingElse.dynamic('should not be transformed');
