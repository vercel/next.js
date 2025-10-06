import dynamic from 'next/dynamic';
const DynamicComponent1 = dynamic(()=>handleImport(import('./components/hello1')), {
    loadableGenerated: {
        webpack: ()=>[
                require.resolveWeak("./components/hello1")
            ]
    },
    loading: ()=>null,
    ssr: false
});
const DynamicComponent2 = dynamic(()=>import('./components/hello2').then((mod)=>{
        return mod.Button;
    }), {
    loadableGenerated: {
        webpack: ()=>[
                require.resolveWeak("./components/hello2")
            ]
    }
});
