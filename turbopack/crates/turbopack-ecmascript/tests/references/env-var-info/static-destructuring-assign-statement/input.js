let FOO1, FOO2
;({ FOO1 } = process.env)
;(({ FOO2 } = process.env), console.log(FOO1, FOO2))
