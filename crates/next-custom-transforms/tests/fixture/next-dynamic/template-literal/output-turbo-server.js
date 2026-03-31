import { __turbopack_module_id__ as id } from "../components/hello" with {
    "turbopack-transition": "next-client-dynamic",
    "turbopack-chunking-type": "none"
};
import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(()=>import(`../components/hello`, {
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
const componentRoot = '@/some-components';
const Component1 = dynamic(()=>import(`${componentRoot}/component1`));
const Component2 = dynamic(()=>import(`${componentRoot}/component2`));
