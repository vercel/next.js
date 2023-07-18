"TURBOPACK { transition: next-dynamic }";
import { __turbopack_module_id__ as id } from "./components/hello";
import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(null, {
    loadableGenerated: {
        modules: [
            id
        ]
    },
    loading: ()=>null,
    ssr: false
});
