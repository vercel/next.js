# Authentication

To use oAuth you need to configure environment variables with ID and secret and configure the service accordingly.

This example comes pre-configured to handle Facebook, Google and Twitter oAuth if you provide the `ID` and `secret` for the service using environment variables.

If you want to add new oAuth providers (for example GitHub), you will need to:

* Add the oAuth provider configuration in `./routes/passport-strategies.js`
* Add a field to your User model (in `./index.js`) with the name of the provider
* Configure the service to point to your website (as in the examples below)
* Specify the environment variables at run time

## Configuring your account

These guides are approximate as exactly how to configure oAuth varies for each provider and tends to change when they update their developer portals.

Twitter's oAuth implementation is the easiest to configure, so you may want to start with that one.

### Twitter

Environment variables:

* TWITTER_KEY
* TWITTER_SECRET

Configuration steps:

1. Sign in at [https://dev.twitter.com](https://dev.twitter.com/)
2. From the profile picture dropdown menu select **My Applications**
3. Click **Create a new application**
4. Enter your application name, website and description
5. For **Callback URL**: `http://your-server.example.com/auth/oauth/twitter/callback`
6. Go to **Settings** tab
7. Under *Application Type* select **Read and Write** access
8. Check the box **Allow this application to be used to Sign in with Twitter**
9. Click **Update this Twitter's applications settings**
10. Specify *Consumer Key* as the **TWITTER_KEY** Config Variable
11. Specify *Consumer Secret* as the **TWITTER_SECRET** Config Variable

### Facebook Login

Environment variables:

* FACEBOOK_ID
* FACEBOOK_SECRET

Configuration steps:

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **Apps > Create a New App** in the navigation bar
3. Enter *Display Name*, then choose a category, then click **Create app**
5. Specify *App ID* as the **FACEBOOK_ID** Config Variable
6. Specify *App Secret* as the **FACEBOOK_SECRET** Config Variable
7. Click on *Settings* on the sidebar, then click **+ Add Platform**
8. Select **Website**
9. Enable 'Client OAuth Login' and 'Web OAuth Login'
10. list`http://your-server.example.com/auth/oauth/facebook/callback` under 'Valid OAuth redirect URIs'
11. List your sites domain under 'domains'

### Google+

Environment variables:

* GOOGLE_ID
* GOOGLE_SECRET

Configuration steps:

1. Visit [Google Cloud Console](https://cloud.google.com/console/project)
2. Click the **CREATE PROJECT** button, enter a *Project Name* and click **CREATE**
3. Then select *APIs* then *Credentials*
4. Select **Create new oAuth Client ID** and enter the following:
 - **Application Type**: Web Application
 - **Authorized Javascript origins**: `http://your-server.example.com/`
 - **Authorized redirect URI**: `http://your-server.example.com/auth/oauth/google/callback`
5. Specify *Client ID* as the **GOOGLE_ID** Config Variable
6. Specify *Client Secret* as the **GOOGLE_SECRET** Config Variable
7. Enable Google+ on the project - if you don't, sign in with Google+ will fail!
