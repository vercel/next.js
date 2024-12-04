# A Feature Rich App Router WordPress Example

This is an example on how you can build a Next.js 14 project (with App Router), using [WordPress](https://wordpress.org) as the data source.

## Key features:

- `robots.ts`: This automatically gets the robots.txt of the API route and serves it on the `/robots.txt` route.
- `sitemap.ts`: This automatically gets all paths from the API and generates a sitemap to serve on the `/sitemap.xml` route.
- `middleware.ts`: This contains a middleware function that checks the users path for stored redirects, and redirects the user if a match is found.
- `[[...slug]]`: This is the catch-all route that is used to render all pages. It is important that this route is not removed, as it is used to render all pages. It fetches the ContentType and renders the corresponding
- `not-found.tsx`: This page is used for dynamic 404 handling - adjust the database id to match your decired WordPress page, and make sure the WordPress slug is "not-found", your 404 page will then be editable from your CMS.
- `codegen.ts`: Automatic type generation for your WordPress installation
- `Draft Mode`: Seamless Preview / Draft Preview support, using authentication through WPGraphQL JWT Authentication and Next.js Draft Mode
- `On Demand Cache Revalidation`: Including a bare minimum WordPress theme that implements cache revalidation, WordPress link rewrites and other utils for integrating with Next.js

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-wordpress&project-name=cms-wordpress&repository-name=cms-wordpress)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example cms-wordpress cms-wordpress-app
```

```bash
yarn create next-app --example cms-wordpress cms-wordpress-app
```

```bash
pnpm create next-app --example cms-wordpress cms-wordpress-app
```

```bash
bunx create-next-app --example cms-wordpress cms-wordpress-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Configuration

### WordPress

1. Set `Site Address (URL)` to your frontend URL, e.g. `https://localhost:3000` in Settings -> General
2. Make sure Permalinks are set to `Post name` in Settings -> Permalinks
3. Set `Sample page` as `Static page` in Settings -> Reading
4. Create a new page called `404 not found` ensuring the slug is `404-not-found`
5. Install and activate following plugins:
   - Add WPGraphQL SEO
   - Classic Editor
   - Redirection
   - WPGraphQL
   - [WPGraphQL JWT Authentication](https://github.com/wp-graphql/wp-graphql-jwt-authentication/releases)
   - Yoast SEO
   - [Advanced Custom Fields PRO](https://www.advancedcustomfields.com/pro/) (optional)
   - WPGraphQL for ACF (optional)
6. Do first-time install of Redirection. Recommended to enable monitor of changes
7. Configure Yoast SEO with:

   - Disable XML Sitemaps under Yoast SEO -> Settings
   - If you did not change the `Site Address (URL)` before installing Yoast, it will ask you to run optimize SEO data after changing permalinks, do so
   - Generate a robots.txt file under Yoast SEO -> Tools -> File Editor
   - Modify robots.txt sitemap reference from `wp-sitemap.xml` to `sitemap.xml`

8. `Enable Public Introspection` under GraphQL -> Settings
9. Add following constants to `wp-config.php`
   ```php
   define('HEADLESS_SECRET', 'INSERT_RANDOM_SECRET_KEY');
   define('HEADLESS_URL', 'INSERT_LOCAL_DEVELOPMENT_URL'); // http://localhost:3000 for local development
   define('GRAPHQL_JWT_AUTH_SECRET_KEY', 'INSERT_RANDOM_SECRET_KEY');
   define('GRAPHQL_JWT_AUTH_CORS_ENABLE', true);
   ```
10. Create a bare minimum custom WordPress theme, consisting of only 2 files:

- [style.css](https://developer.wordpress.org/themes/basics/main-stylesheet-style-css/#basic-structure)
- functions.php (see the bottom of this README)

### Next.js

1. Clone the repository
2. Run `npm install` to install dependencies
3. Create `.env` file in the root directory and add the following variables:

| Name                                 | Value                                                                   | Example                  | Description                                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_BASE_URL`               | Insert base url of frontend                                             | http://localhost:3000    | Used for generating sitemap, redirects etc.                                                                                                                         |
| `NEXT_PUBLIC_WORDPRESS_API_URL`      | Insert base url of your WordPress installation                          | http://wp-domain.com     | Used when requesting wordpress for data                                                                                                                             |
| `NEXT_PUBLIC_WORDPRESS_API_HOSTNAME` | The hostname without protocol for your WordPress installation           | wp-domain.com            | Used for dynamically populating the next.config images remotePatterns                                                                                               |
| `HEADLESS_SECRET`                    | Insert the same random key, that you generated for your `wp-config.php` | INSERT_RANDOM_SECRET_KEY | Used for public exhanges between frontend and backend                                                                                                               |
| `WP_USER`                            | Insert a valid WordPress username                                       | username                 | Username for a system user created specifically for interacting with your WordPress installation                                                                    |
| `WP_APP_PASS`                        | Insert application password                                             | 1234 5678 abcd efgh      | [Generate an application password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) for the WordPress user defined in `WP_USER` |

> [!WARNING] > `WP_USER` and `WP_APP_PASS` are critical for making preview and redirection work

4. Adjust the ID in `not-found.tsx` to match the post id of your "404 Not Found" page in WordPress

5. `npm run dev` and build an awesome application with WordPress!

> [!NOTE] > Running `npm run dev` will automatically generate typings from the WordPress installation found on the url provided in your environment variable: `NEXT_PUBLIC_WORDPRESS_API_URL`

## GraphQL and typescript types

We are generating typescript types from the provided schema with Codegen.

### Enabling Auto Completion for graphql queries

If you want to add auto completion for your queries, you can do this by installing the "Apollo GraphQL" extension in VS Code and adding an `apollo.config.js` file, next to the `next.config.js`, and add the following to it:

```javascript
module.exports = {
  client: {
    service: {
      name: "WordPress",
      localSchemaFile: "./src/gql/schema.gql",
    },
  },
};
```

## Advanced Custom Fields PRO (optional, but recommended)

I will recommend building your page content by using the [Flexible Content](https://www.advancedcustomfields.com/resources/flexible-content/) data type in ACF Pro.
This will make you able to create a "Block Builder" editor experience, but still having everything automatically type generated, and recieving the data in a structured way.
The default "Gutenberg" editor returns a lot of HTML, which makes you loose a lot of the advantages of using GraphQL with type generation.

## Redirection setup

The example supports the WordPress "Redirection" plugin. the `WP_USER` and `WP_APP_PASS` environment variables are required, for this to work. By implementing this you can manage redirects for your content, through your WordPress CMS

## Draft / Preview support

The example supports WordPress preview (also draft preview), when enabling `draftMode` in the `api/preview/route.ts` it logs the `WP_USER` in with the `WP_APP_PASS` and requests the GraphQL as an authenticated user. This makes draft and preview available. If a post is in "draft" status, it doesn't have a real slug. In this case we redirect to a "fake" route called `/preview/${id}` and uses the supplied id for fetching data for the post.

## Cache Revalidation

All our GraphQL requests has the cache tag `wordpress` - when we update anything in WordPress, we call our `/api/revalidate` route, and revalidates the `wordpress` tag. In this way we ensure that everything is up to date, but only revalidate the cache when there actually are updates.

## Template handling

We use an "Optional Catch-all Segment" for handling all WordPress content.
When rendering this component we simply ask GraphQL "what type of content is this route?" and fetch the corresponding template.
Each template can then have their own queries for fetching specific content for that template.

## SEO

We are using Yoast SEO for handling SEO in WordPress, and then all routes are requesting the Yoast SEO object, and parsing this to a dynamic `generateMetadata()` function

## Folder structure

The boilerplate is structured as follows:

- `app`: Contains the routes and pages of the application
- `assets`: Contains helpful styles such as the variables
- `components`: Contains the components used in the application
- `gql`: Contains auto-generated types from GraphQL via CodeGen
- `queries`: Contains reusable data fetch requests to GraphQL
- `utils`: Contains helpful functions used across the application

## WordPress theme functions.php

This `functions.php` is implementing different useful features for using WordPress with Next.js:

- Setting up a primary menu (fetched in `Navigation..tsx`)
- Rewriting preview and rest links to match the frontend instead of the WordPress installation
- Implementing cache tag revalidation everytime you update a post in WordPress
- Implementing rest endpoints for sitemap generation

```php
<?php
/**
 * Registers new menus
 *
 * @return void
 */
add_action('init', 'register_new_menu');
function register_new_menu()
{
  register_nav_menus(
    array(
      'primary-menu' => __('Primary menu')
    )
  );
}

/**
 * Changes the REST API root URL to use the home URL as the base.
 *
 * @param string $url The complete URL including scheme and path.
 * @return string The REST API root URL.
 */
add_filter('rest_url', 'home_url_as_api_url');
function home_url_as_api_url($url)
{
  $url = str_replace(home_url(), site_url(), $url);
  return $url;
}

/**
 * Customize the preview button in the WordPress admin.
 *
 * This function modifies the preview link for a post to point to a headless client setup.
 *
 * @param string  $link Original WordPress preview link.
 * @param WP_Post $post Current post object.
 * @return string Modified headless preview link.
 */
add_filter( 'preview_post_link', 'set_headless_preview_link', 10, 2 );
function set_headless_preview_link( string $link, WP_Post $post ): string {
	// Set the front-end preview route.
  $frontendUrl = HEADLESS_URL;

	// Update the preview link in WordPress.
  return add_query_arg(
    [
      'secret' => HEADLESS_SECRET,
      'id' => $post->ID,
    ],
    esc_url_raw( esc_url_raw( "$frontendUrl/api/preview" ))
  );
}

add_filter( 'rest_prepare_page', 'set_headless_rest_preview_link', 10, 2 );
add_filter( 'rest_prepare_post', 'set_headless_rest_preview_link' , 10, 2 );
function set_headless_rest_preview_link( WP_REST_Response $response, WP_Post $post ): WP_REST_Response {
  // Check if the post status is 'draft' and set the preview link accordingly.
  if ( 'draft' === $post->post_status ) {
    $response->data['link'] = get_preview_post_link( $post );
    return $response;
  }

  // For published posts, modify the permalink to point to the frontend.
  if ( 'publish' === $post->post_status ) {

    // Get the post permalink.
    $permalink = get_permalink( $post );

    // Check if the permalink contains the site URL.
    if ( false !== stristr( $permalink, get_site_url() ) ) {

      $frontendUrl = HEADLESS_URL;

      // Replace the site URL with the frontend URL.
      $response->data['link'] = str_ireplace(
        get_site_url(),
        $frontendUrl,
        $permalink
      );
    }
  }

  return $response;
}


/**
 * Adds the headless_revalidate function to the save_post action hook.
 * This function makes a PUT request to the headless site' api/revalidate endpoint with JSON body: paths = ['/path/to/page', '/path/to/another/page']
 * Requires HEADLESS_URL and HEADLESS_SECRET to be defined in wp-config.php
 *
 * @param int $post_ID The ID of the post being saved.
 * @return void
 */
add_action('transition_post_status', 'headless_revalidate', 10, 3);
function headless_revalidate(string $new_status, string $old_status, object $post ): void
{
  if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ( defined( 'DOING_CRON' ) && DOING_CRON ) ) {
    return;
  }

  // Ignore drafts and inherited posts.
  if ( ( 'draft' === $new_status && 'draft' === $old_status ) || 'inherit' === $new_status ) {
    return;
  }

  $frontendUrl = HEADLESS_URL;
  $headlessSecret = HEADLESS_SECRET;

  $data = json_encode([
    'tags'  => ['wordpress'],
  ]);

  $response = wp_remote_request("$frontendUrl/api/revalidate/", [
    'method'  => 'PUT',
    'body'    => $data,
    'headers' => [
      'X-Headless-Secret-Key' => $headlessSecret,
      'Content-Type'  => 'application/json',
    ],
  ]);

  // Check if the request was successful
  if (is_wp_error($response)) {
    // Handle error
    error_log($response->get_error_message());
  }
}

function wsra_get_user_inputs()
{
  $pageNo = sprintf("%d", $_GET['pageNo']);
  $perPage = sprintf("%d", $_GET['perPage']);
  // Check for array key taxonomyType
  if (array_key_exists('taxonomyType', $_GET)) {
    $taxonomy = $_GET['taxonomyType'];
  } else {
    $taxonomy = 'category';
  }
  $postType = $_GET['postType'];
  $paged = $pageNo ? $pageNo : 1;
  $perPage = $perPage ? $perPage : 100;
  $offset = ($paged - 1) * $perPage;
  $args = array(
    'number' => $perPage,
    'offset' => $offset,
  );
  $postArgs = array(
    'posts_per_page' => $perPage,
    'post_type' => strval($postType ? $postType : 'post'),
    'paged' => $paged,
  );

  return [$args, $postArgs, $taxonomy];
}

function wsra_generate_author_api()
{
  [$args] = wsra_get_user_inputs();
  $author_urls = array();
  $authors =  get_users($args);
  foreach ($authors as $author) {
    $fullUrl = esc_url(get_author_posts_url($author->ID));
    $url = str_replace(home_url(), '', $fullUrl);
    $tempArray = [
      'url' => $url,
    ];
    array_push($author_urls, $tempArray);
  }
  return array_merge($author_urls);
}

function wsra_generate_taxonomy_api()
{
  [$args,, $taxonomy] = wsra_get_user_inputs();
  $taxonomy_urls = array();
  $taxonomys = $taxonomy == 'tag' ? get_tags($args) : get_categories($args);
  foreach ($taxonomys as $taxonomy) {
    $fullUrl = esc_url(get_category_link($taxonomy->term_id));
    $url = str_replace(home_url(), '', $fullUrl);
    $tempArray = [
      'url' => $url,
    ];
    array_push($taxonomy_urls, $tempArray);
  }
  return array_merge($taxonomy_urls);
}

function wsra_generate_posts_api()
{
  [, $postArgs] = wsra_get_user_inputs();
  $postUrls = array();
  $query = new WP_Query($postArgs);

  while ($query->have_posts()) {
    $query->the_post();
    $uri = str_replace(home_url(), '', get_permalink());
    $tempArray = [
      'url' => $uri,
      'post_modified_date' => get_the_modified_date(),
    ];
    array_push($postUrls, $tempArray);
  }
  wp_reset_postdata();
  return array_merge($postUrls);
}

function wsra_generate_totalpages_api()
{
  $args = array(
    'exclude_from_search' => false
  );
  $argsTwo = array(
    'publicly_queryable' => true
  );
  $post_types = get_post_types($args, 'names');
  $post_typesTwo = get_post_types($argsTwo, 'names');
  $post_types = array_merge($post_types, $post_typesTwo);
  unset($post_types['attachment']);
  $defaultArray = [
    'category' => count(get_categories()),
    'tag' => count(get_tags()),
    'user' => (int)count_users()['total_users'],
  ];
  $tempValueHolder = array();
  foreach ($post_types as $postType) {
    $tempValueHolder[$postType] = (int)wp_count_posts($postType)->publish;
  }
  return array_merge($defaultArray, $tempValueHolder);
}

add_action('rest_api_init', function () {
  register_rest_route('sitemap/v1', '/posts', array(
    'methods' => 'GET',
    'callback' => 'wsra_generate_posts_api',
  ));
});
add_action('rest_api_init', function () {
  register_rest_route('sitemap/v1', '/taxonomy', array(
    'methods' => 'GET',
    'callback' => 'wsra_generate_taxonomy_api',
  ));
});
add_action('rest_api_init', function () {
  register_rest_route('sitemap/v1', '/author', array(
    'methods' => 'GET',
    'callback' => 'wsra_generate_author_api',
  ));
});
add_action('rest_api_init', function () {
  register_rest_route('sitemap/v1', '/totalpages', array(
    'methods' => 'GET',
    'callback' => 'wsra_generate_totalpages_api',
  ));
});

```
