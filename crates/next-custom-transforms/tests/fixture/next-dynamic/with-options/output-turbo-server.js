import { __turbopack_module_id__ as id } from "../components/hello" with {
    "turbopack-transition": "next-client-dynamic",
    "turbopack-chunking-type": "none"
};
import { __turbopack_module_id__ as id1 } from "../components/hello" with {
    "turbopack-transition": "next-client-dynamic",
    "turbopack-chunking-type": "none"
};
import { __turbopack_module_id__ as id2 } from "../components/hello" with {
    "turbopack-transition": "next-client-dynamic",
    "turbopack-chunking-type": "none"
};
import dynamic from 'next/dynamic';
const DynamicComponentWithCustomLoading = dynamic(()=>import('../components/hello', {
        with: {
            "turbopack-transition": "next-dynamic",
            "turbopack-chunking-type": "parallel"
        }
    }), {
    loadableGenerated: {
        modules: [
            id
        ]
    },
    loading: ()=><p>...</p>
});
const DynamicClientOnlyComponent = dynamic(async ()=>{}, {
    loadableGenerated: {
        modules: [
            id1
        ]
    },
    ssr: false
});
const DynamicClientOnlyComponentWithSuspense = dynamic(async ()=>{}, {
    loadableGenerated: {
        modules: [
            id2
        ]
    },
    ssr: false,
    suspense: true
});
