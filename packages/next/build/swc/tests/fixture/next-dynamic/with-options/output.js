import dynamic from "next/dynamic";
const DynamicComponentWithCustomLoading = dynamic(()=>import("../components/hello")
, {
    loadableGenerated: {
        webpack: ()=>[
                require.resolveWeak("/some-project/src/some-file.js")
            ]
        ,
        modules: [
            "some-file.js -> " + "../components/hello"
        ]
    },
    loading: ()=><p >...</p>
});
