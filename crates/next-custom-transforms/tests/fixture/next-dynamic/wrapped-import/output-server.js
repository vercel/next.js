import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(()=>handleImport(import('./components/hello')), {
    loadableGenerated: {
        modules: [
            "src/some-file.js -> " + "./components/hello"
        ]
    },
    loading: ()=>null,
    ssr: false
});
