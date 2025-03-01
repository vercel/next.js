import { __turbopack_module_id__ as id } from "../components/hello1" with {
    "turbopack-transition": "next-client-dynamic",
    "turbopack-chunking-type": "none"
};
import { __turbopack_module_id__ as id1 } from "../components/hello2" with {
    "turbopack-transition": "next-client-dynamic",
    "turbopack-chunking-type": "none"
};
import dynamic1 from 'next/dynamic';
import dynamic2 from 'next/dynamic';
const DynamicComponent1 = dynamic1(()=>import('../components/hello1', {
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
const DynamicComponent2 = dynamic2(()=>import('../components/hello2', {
        with: {
            "turbopack-transition": "next-dynamic"
        }
    }), {
    loadableGenerated: {
        modules: [
            id1
        ]
    }
});
