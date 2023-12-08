import { __turbopack_module_id__ as id } from "./components/hello" with {
    "transition": "next-dynamic"
};
import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(()=>handleImport(import('./components/hello')), {
    loadableGenerated: {
        modules: [
            id
        ]
    },
    loading: ()=>null,
    ssr: false
});
