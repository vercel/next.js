import { __turbopack_module_id__ as id } from "../components/hello" with {
    "transition": "next-dynamic"
};
import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(()=>import('../components/hello'), {
    loadableGenerated: {
        modules: [
            id
        ]
    }
});
