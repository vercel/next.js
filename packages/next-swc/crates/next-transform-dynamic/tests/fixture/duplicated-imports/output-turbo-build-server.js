import { __turbopack_module_id__ as id } from "../components/hello1" with {
    "transition": "next-dynamic"
};
import { __turbopack_module_id__ as id1 } from "../components/hello2" with {
    "transition": "next-dynamic"
};
import dynamic1 from 'next/dynamic';
import dynamic2 from 'next/dynamic';
const DynamicComponent1 = dynamic1(()=>import('../components/hello1'), {
    loadableGenerated: {
        modules: [
            id
        ]
    }
});
const DynamicComponent2 = dynamic2(()=>import('../components/hello2'), {
    loadableGenerated: {
        modules: [
            id1
        ]
    }
});
