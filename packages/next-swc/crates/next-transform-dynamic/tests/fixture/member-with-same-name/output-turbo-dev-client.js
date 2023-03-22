"TURBOPACK { chunking-type: none }";
import { __turbopack_module_id__ as id } from "../components/hello";
import dynamic from 'next/dynamic';
import somethingElse from 'something-else';
const DynamicComponent = dynamic(()=>import('../components/hello'), {
    loadableGenerated: {
        modules: [
            id
        ]
    }
});
somethingElse.dynamic('should not be transformed');
