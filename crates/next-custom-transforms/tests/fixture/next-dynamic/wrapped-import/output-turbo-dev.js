import { __turbopack_module_id__ as id } from "./components/hello1" with {
    "turbopack-transition": "next-client-dynamic",
    "turbopack-chunking-type": "none"
};
import { __turbopack_module_id__ as id1 } from "./components/hello2" with {
    "turbopack-transition": "next-client-dynamic",
    "turbopack-chunking-type": "none"
};
import dynamic from 'next/dynamic';
const DynamicComponent1 = dynamic(()=>handleImport(import('./components/hello1', {
        with: {
            "turbopack-transition": "next-dynamic"
        }
    })), {
    loadableGenerated: {
        modules: [
            id
        ]
    },
    loading: ()=>null,
    ssr: false
});
const DynamicComponent2 = dynamic(()=>import('./components/hello2', {
        with: {
            "turbopack-transition": "next-dynamic"
        }
    }).then((mod)=>{
        return mod.Button;
    }), {
    loadableGenerated: {
        modules: [
            id1
        ]
    }
});
