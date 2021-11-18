import dynamic from "next/dynamic";
const DynamicComponentWithCustomLoading = dynamic(()=>import("../components/hello")
, {
    loadableGenerated: {
        webpack: ()=>[
                require.resolveWeak("../components/hello")
            ]
        ,
        modules: [
            "some-file.js -> " + "../components/hello"
        ]
    },
    loading: ()=><p >...</p>
});
