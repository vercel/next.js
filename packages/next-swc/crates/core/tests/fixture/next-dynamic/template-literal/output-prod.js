import dynamic from "next/dynamic";
const Test = dynamic(()=>import(`/components/test`), {
    loadableGenerated: {
        webpack: ()=>[
                require.resolveWeak("/components/test")
            ]
    }
});
