import dynamic from 'next/dynamic';
import somethingElse from 'something-else';
const DynamicComponent = dynamic(()=>import('../components/hello')
, {
    loadableGenerated: {
        modules: [
            "some-file.js -> " + "../components/hello"
        ]
    }
});
somethingElse.dynamic('should not be transformed');
