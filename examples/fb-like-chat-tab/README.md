[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/v3-beta/examples/fb-like-chat-tab)

 # A basic example showcasing facebook like chat tabs which are persistent across various links, using Next.js

 ## How to use

 Download the example [or clone the repo]<GIT URL>


 Install it and run:

 ```bash
 npm install
 npm run dev
 ```

 ## The idea behind the example

 This example show how to use Next.js  <Link> `('next\link')` and a global variable to set state of components and make it persistent across links. Our pages are: home, about and contact and they all share the same number and states of chatTabs opened from any of Links (Home, About , Contact).

 ## Component Structure

  * Layout - Common accross all pages
    * Header - Nav bar for Home, About , Contact link
    * ChatComponent
      * ChatSideBar - Displays Name of user (Static)
      * ChatPannel - Rendered when any name from sideBar is clicked.(Dynamic)


**Example:** [https://fb-like-chat-tab-rwsrwenegf.now.sh](https://fb-like-chat-tab-rwsrwenegf.now.sh)
