import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(()=>handleImport(import('./components/hello'))
, {
    loadableGenerated: {
        webpack: ()=>[
                require.resolveWeak("./components/hello")
            ]
    },
    loading: ()=>null
    ,
    ssr: false
});
