import { __turbopack_module_id__ as id } from "../components/hello" with {
    "chunking-type": "none"
};
import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(()=>import('../components/hello'), {
    loadableGenerated: {
        modules: [
            id
        ]
    }
});
