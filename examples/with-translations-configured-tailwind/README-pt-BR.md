# Site moderno com traduções

Este é um template de site moderno feito por 
Lucas Christian, utilizando Next, React, Typscript, e
Tailwind CSS, foram unidos diversos exemplos, e foi 
feito da forma mais simples, e profissional, para 
desenvolver websites.

## Como clonar o template

O clone irá puxar da minha conta secundária, para 
não bagunçar a minha conta pública.
Você pode também ver o [preview do website](https://modern-website-using-nextjs-with-translations.vercel.app/)!
```bash 
git clone https://github.com/LordLuch/modern-website-using-nextjs-with-translations.git
```

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/Lucas-Christian/modern-websites/tree/main/typescript/next.js/with-translations&project-name=modern-website&repository-name=modern-website-using-nextjs-with-translations)

## Sobre o Template

- Propositalmente sem CSS;
- Ambiente profissional utilizando Next.js;
- Explicações sobre as pastas e arquivos logo abaixo.

### components

É esperado que os componentes fiquem e sejam puxados
desta página, sejam eles o layout da página, footer,
navbar, ou outro qualquer.

### lib

É esperado que na pasta lib fiquem as bibliotecas 
necessárias, assim como constantes para posterior
manutenção do seu website.

#### constants.ts

Imagine que você colocou algum url pedido pelo seu 
cliente, e depois o seu cliente pediu para que você 
trocasse esse url, pois deu um problema nele, e você
tinha colocado esse url em diversos locais e botões, agora 
você tem que ir buscando e alterando esse url, em todos os
locais onde você anteriormente teria colocado ele, é
fácil perceber como isso é cansativo, por isso ao deixar 
o valor salvo no arquivo constants você pode alterar apenas
uma vez o url, e ele irá alterar em todos os locais.

### locales

Todos os novos idiomas devem obrigatoriamente ser colocados aqui
para que o next-translate detecte automaticamente as mudanças.

### pages

Todos as novas páginas devem obrigatoriamente ser colocadas aqui
para que o next detecte automaticamente as mudanças.

#### _app.tsx

O next.js utiliza este componente para inicializar as páginas, você 
pode sobreescrever, e controlar a inicialização do seu site, ao 
modificá-lo, nele você pode fazer animações de loading para a sua 
página, algumas verificações, e várias outras coisas.

#### _document.tsx

O next.js substitui o documento gerado automaticamente pelo escrito
aqui, isso evita muitos bugs(MUITOS MESMO).

#### index.tsx

Este é o "/" ou, a home do seu site, qualquer coisa que você faça a
função Home retornar, é espero que apareça na tela.

#### about.tsx

Este é o "/about" ou, a página about feita de exemplo, qualquer coisa que 
você faça a função About retornar, é espero que apareça na tela.

### public

É esperado que todas as imagens sejam colocadas aqui.

### Styles

É esperado que os estilos das páginas sejam eles globais
ou focados em uma única página, fiquem na pasta styles.

### i18n.json

Todas as configurações das traduções devem ser feitas aqui.
- Caso você queira ativar a localização automatica basta remover a linha:
```bash
"localeDetection": false
```

### next.config.js

Todas as configurações do next.js devem ser feitas aqui.

### postcss.config.js

É necessário para que o tailwind CSS funcione.

### tailwind.config.js

Todas as configurações do tailwind CSS devem ser feitas aqui.

### tsconfig.json

Todas as configurações do typescript devem ser feitas aqui.

## Autores

- [Lucas Christian](https://github.com/Lucas-Christian)
- [LordLuch (Minha conta secundária)](https://www.github.com/LordLuch)

## Referências

 - [Exemplo com tradução](https://github.com/vercel/next.js/tree/canary/examples/with-next-translate)
 - [Exemplo de construção moderna](https://github.com/vercel/next.js/tree/canary/examples/cms-wordpress)
 - [Playlist que inspirou este template](https://www.youtube.com/playlist?list=PLMdYygf53DP7FJzPslLnmqp0QylyFfA8a)
