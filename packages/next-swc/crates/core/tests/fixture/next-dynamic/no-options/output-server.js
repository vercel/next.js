import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(()=>import('../components/hello')
, {
    loadableGenerated: {
        modules: [
            "some-file.js -> " + "../components/hello"
        ]
    }
});
