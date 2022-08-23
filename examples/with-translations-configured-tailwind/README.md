# Modern website with translations.

This is a modern website template made by
Lucas Christian, using Next, React, Typscript, and
Tailwind CSS, several examples were joined, and it was
made in the simplest and most professional way to
develop websites.

## How to clone the template

The clone will pull from my secondary account, to
don't mess up my public account.
You can also view the [website preview](https://modern-website-using-nextjs-with-translations.vercel.app/)!
```bash 
git clone https://github.com/LordLuch/modern-website-using-nextjs-with-translations.git
```

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/Lucas-Christian/modern-websites/tree/main/typescript/next.js/with-translations&project-name=modern-website&repository-name=modern-website-using-nextjs-with-translations)


## About the Template

- Purposely without CSS;
- Professional environment using Next.js;
- Explanations of folders and files below.

### components

Components are expected to stand and be pulled
of this page, whether they are the page layout, footer,
navbar, or whatever.

### lib

It is expected that in the lib folder are the libraries
necessary, as well as constants for later
maintenance of your website.

#### constants.ts

Imagine that you put some url requested by your
customer, and then your customer asked you to
change this url, because there was a problem with it, and you
I had put this url in several places and buttons, now
you have to go looking for and changing this url, in all
places where you would have previously placed it, is
easy to see how tiring this is, so when leaving
the value saved in constants file you can change only
once the url, and it will change everywhere.

### locales

All new languages must be placed here so that next-translate 
automatically detects the changes.

### pages

All new pages must be placed here so that next automatically 
detects the changes.

#### _app.tsx

next.js uses this component to initialize pages, you
can overwrite, and control the launch of your site, by
modify it, in it you can make loading animations for your
page, some checks, and several other things.

#### _document.tsx

The next.js replaces the auto-generated document with the written
here, this avoids a lot of bugs(A LOT of them).

#### index.tsx

This is the "/" or, the home of your site, anything you do to
Home function return, it is expected to appear on the screen.

#### about.tsx

This is the "/about" or, the about page made for example, anything that
you make the About function return, I hope it appears on the screen.

### public

It is expected that all images will be placed here.

### Styles

Page styles are expected to be global
or focused on a single page, stay in the styles folder.

### i18n.json

All translation settings must be done here.
- If you want to activate the automatic location just remove the line:
```bash
"localeDetection": false
```

### next.config.js

All next.js settings must be done here.

### postcss.config.js

It is necessary for tailwind CSS to work.

### tailwind.config.js

All tailwind CSS settings must be done here.

### tsconfig.json

All typescript settings must be done here.

## Authors

- [Lucas Christian](https://github.com/Lucas-Christian)
- [LordLuch (My secondary account)](https://www.github.com/LordLuch)

## Referências

 - [Example with translation](https://github.com/vercel/next.js/tree/canary/examples/with-next-translate)
 - [Example of a professionally designed website](https://github.com/vercel/next.js/tree/canary/examples/cms-wordpress)
 - [Playlist that inspired this template](https://www.youtube.com/playlist?list=PLMdYygf53DP7FJzPslLnmqp0QylyFfA8a)
