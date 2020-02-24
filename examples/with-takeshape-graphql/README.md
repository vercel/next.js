[![TakeShape](https://img.shields.io/badge/cms-takeshape-brightgreen.svg?logoWidth=14&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAA4CAYAAACohjseAAABG2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNS41LjAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+Gkqr6gAAAYFpQ0NQc1JHQiBJRUM2MTk2Ni0yLjEAACiRdZHPK0RRFMc/BtEYzZRZKNRLw8qIURMbZSSUpDHKr83MMz/U/Hi99yTZKtspSmz8WvAXsFXWShEpWVhZExum5zyjZpI5t3PP537vPad7zwVHJK1mjJoeyGRNPTwaUmbn5pW6Z5y04cFLS1Q1tKGpqQkq2scdVXa88du1Kp/71xqW4oYKVfXCg6qmm8JjwhOrpmbztrBXTUWXhE+Fu3S5oPCtrceK/GJzsshfNuuR8DA4PMJKsoxjZaym9IywvBxfJr2i/t7Hfokrnp2Zltgu3opBmFFCKIwzwjBBehmQOYifAN2yokJ+z0/+JDnJVWXWWENnmSQpTLpEXZHqcYkJ0eMy0qzZ/f/bVyPRFyhWd4Wg9smy3jqgbgsKecv6PLSswhFUP8JFtpSfO4D+d9HzJc23D+4NOLssabEdON+E5gctqkd/pGpxRyIBryfQOAdN1+BcKPbsd5/je4isy1ddwe4edMp59+I3T6Zn2yrilxMAAAAJcEhZcwAACxMAAAsTAQCanBgAAAJVSURBVGiB7dm/b9NAGMbx70uBMnRhQyA6VMzsiBWJFQYWdthYEP9CN2aG8FdApQpYEBM7A0JCLDCwMVAJIUA8HeIrruPE97O2gx8pSi6SL+/Hd7F9NkyZMuW/jaTLku72XUeRVLhPmude3/VkTQOntUIuwa0HsgM3bqQnLjvSJD3I1Vkjb8zsnWtIugPsuGbtvf55E9it2vfN7GlyFZ57NDTPJJ2JqGUr+0gWwO1JOhtZSxOYjDzdaD8Hfif09xV4ZGa/JF0CrgMb1e9s1F719g8zm63ocyaJ6Ona2FvnozpZ7HNb/geUL7Xt2kYwbSRzAwNxIcA4ZE5gBC4UGI7MBYzExQCDkKdiQU0c8Jp/57nSmfkik4E94Fy8kEnAHnEuncho4ABwLiuRUcAB4VyWIoOBA8S5tCKDgAPGuSwgvYEjwLkcQ3oBR4RzOUI2VxMLkXSRceFcZpL++ozgN+Bj6WoK5AB43wk0s5/ALeBl8ZLy5QC4aWZvvf6DI0Me4SDgKDoS5DEcBJ4HB45cwEHElcxAka04iLwWHRhyKQ4SVhMDQa7EQeJ6sGdkJw4yrOh7QnrhINM9mRNGeuMgExBODBmEA4rc+D0n6UWB24bfJV2LKSgrMALpA4zDMX8+qFr7FWkPX/bN7IlDAlc8tvljZh+qbbaYT8N6wqdlPZ57OSQPowqhdQSjR64kMBrZAKbjmK/oH6d20pILkrbN7LP7QtJt4EbHdu7Badq07CPyP/BkGble4oEcL85lBXL8OJcW5PrgXGrI9cO5VMirfdcxZcqUcjkEtBb8Ina+cYEAAAAASUVORK5CYII=&longCache=true&colorB=5edeb3&colorA=5539d2&style=for-the-badge)](https://www.takeshape.io/)

# TakeShape GraphQL example

This is a sample project to get you started building a static website with [TakeShape](https://www.takeshape.io) (TS) and [Next.js](https://nextjs.org/).
This project references the same Shape Blog content template as the [shape-blog sample project](https://github.com/takeshape/takeshape-samples/tree/master/shape-blog) but instead of directly generating the page source using the TakeShape Static Site Generator (SSG), it uses the Next.js framework to create a statically-generated React application.

## Deploy your own

### [ZEIT Now](https://zeit.co/home)

An easy way to deploy Next.js to production is with ZEIT Now, a platform from the creators of Next.js.

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=template=https://github.com/zeit/next.js/tree/canary/examples/with-takeshape-graphql)

Alternatively you can use the `now` CLI.

```bash
npm install -g now
```

You may need to use the `now login` command to authenticate your CLI.

Next, add your TakeShape credentials to Now so that it can use them when running your site:

```bash
now secrets add takeshape-api-key YOUR-API-KEY
now secrets add takeshape-project YOUR-PROJECT-ID
```

Then you can deploy using the `now` command from the project root:

```bash
now
```

## How to use

1. [Signup](https://app.takeshape.io/signup) or [login](https://app.takeshape.io/login) at TakeShape.
1. Create a new project and select the "Shape Blog" template
1. `git clone https://github.com/zeit/next-js && cd next-js/examples/with-takeshape-graphql`
1. `yarn` - This will install all dependencies

### Connect your project

1. In your "Shape Blog" TakeShape project, create a new API Key
1. Create a `.env` file in the project root containing values for your `TAKESHAPE_PROJECT` and `TAKESHAPE_API_KEY`, such as:

```bash
TAKESHAPE_PROJECT="YOUR PROJECT ID HERE"
TAKESHAPE_API_KEY="YOUR API KEY HERE"
```

1. `yarn dev` - The server runs on [http://localhost:3000](http://localhost:3000) by default
1. Have fun playing around with the sample site!
   - Change some markup a template file and the site will regenerate automatically
   - Try adding a new field to an existing content type then add it to the corresponding GraphQL query and template

See the [shape-blog README for additional documentation](https://github.com/takeshape/takeshape-samples/tree/master/shape-blog)

## Reach out

If we can make your life easier we want to hear from you at [support@takeshape.io](mailto:support@takeshape.io)
