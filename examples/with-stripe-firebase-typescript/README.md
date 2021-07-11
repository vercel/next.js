# Introduction

This example uses three libraries to demonstrate how you can setup a simple subscription payment system, with exclusive access to premium content for paying customers, using:

- [Next.JS](https://nextjs.org/) 😍
- [Firebase](https://firebase.google.com/) 🔥
- [Stripe](https://stripe.com/) 🦓

It makes use of the [Run Subscription Payments with Stripe Firebase extension](https://firebase.google.com/products/extensions/firestore-stripe-subscriptions).

The example also uses basic react hooks from the [react-firebase-hooks](https://www.npmjs.com/package/react-firebase-hooks) package.

There is a significant amount of configuration required to make this work outside of the codebase, outlined in the steps below.

---

## Creating A Firebase Project

To get started with Firebase, navigate to [The Firebase Console](https://console.firebase.google.com/) and sign in with your Google Account.

To create a new project, click **Add project** and enter a project name, and configure the simple project settings to your choosing.

<br>

### Set Up Firebase Authentication

To set-up Firebase Authentication, click **Authentication** in the left-side menu:

![image.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625644413718/skJM5euCq.png)

This example uses GitHub to sign up users. To enable GitHub Authentication, scroll down to GitHub and toggle it to **Enabled**.

![image.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625644497217/EdOFHj1hb.png)

You'll notice we need to provide a `Client ID` and a `Client secret` in order for us to enable GitHub authentication. To retrieve those values, you need to create a GitHub Application.

First, copy the authorisation callback URL (as seen below)

![image.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625644826126/ECE6fuNgR.png)

### GitHub Auth Application

To create a GitHub application, navigate to the [GitHub Homepage](http://github.com/), click your profile icon in the top right corner > **Settings** > **Developer Settings** > **OAuth Apps** > **Register a new Application**

![image.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625644787356/lALRxwAUb.png)

Now click on **New OAuth App**.

- Pick a name for your GitHub OAuth Application.
- Set `http://localhost:3000/` as the Homepage URL
- Use the URL we copied from Firebase in the step above as the **Authorization callback URL**.

Generate a **Client Secret** for your GitHub OAuth app, and copy both the `Client ID`
`Client Secret` from the GitHub application to the Firebase Authentication configuration window.

<br>

### Create a Web App within Firebase Project

To create a web application for us to communicate to our Firebase project's resources, click the **Gear icon** from the menu, then click **Project Settings**.

![image.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625645465444/BdgX1Rmw7d.png)

You need to add a **Web App** to this project.

Give your web application a name, and leave the configuration window open; you will need to set these variables up in your Next.JS project now.

Replicate the example structure of the `.env.example` file found in this project into a file named `.env.local`.

Copy and paste your configuration variables from firebase into the `.env.local` file, so that it ends up looking like this:

```
NEXT_PUBLIC_FIREBASE_API_KEY=<your-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<your-auth-domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<your-project-id>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<your-storage-bucket>
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<your-sender-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<your-firebase-app-id>
```

<br>

### Cloud Firestore

Create a [Firestore Database](https://firebase.google.com/docs/firestore) in your Firebase project.

To do that, click `Firestore Database` from the Firebase console menu, choose a region, and start the database in **Test Mode**.

<br>

## The Firebase Stripe Extension

You will need to [set up a Stripe account](https://dashboard.stripe.com/register) for yourself, if you don't have one already.

Navigate to the [Run Subscription Payments With Stripe](https://firebase.google.com/products/extensions/firestore-stripe-subscriptions) Firebase Extension page.

_Note: The use of Cloud functions (which are part of this extension), requires the Blaze plan, which is the pay-as-you-go plan of Firebase._ You should set up [budgets and budget alerts](https://firebase.google.com/docs/projects/billing/avoid-surprise-bills) for your project.

To install the extension, click the **Install In Console** button, and select your Firebase project.

![image.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625655211941/yENSDTI4I.png)

This extension will build out 6 Firebase Cloud Functions when you install it:

| Cloud Function        | Purpose                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| createCustomer        | Creates a Stripe customer object when a new user signs up                                                                        |
| createCheckoutSession | Creates a Checkout session to collect the customer's payment details                                                             |
| createPortalLink      | Creates links to the customer portal for the user to manage their payment & subscription details                                 |
| handleWebhookEvents   | Handles Stripe webhook events to keep subscription statuses in sync and update custom claims                                     |
| onUserDeleted         | Deletes the Stripe customer object and cancels all their subscriptions when the user is deleted in Firebase Authentication       |
| onCustomerDataDeleted | Deletes the Stripe customer object and cancels all their subscriptions when the customer document in Cloud Firestore is delteted |

Configure the extension with these settings:

![image.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625729722580/WxDhLnbJ0.png)

While viewing **test data** in your stripe dashboard, navigate to **Developers > API Keys**.

Generate a new **Restricted Key** with the following permissions:

- **Write** access to **Customers**,
- **Write** access to **Checkout Sessions**
- **Write** access to **Customer portal**
- **Read** access to **Subscriptions**
- **Read** access to **Plans**

Give your new restricted key a name, and copy the key into the `Stripe API Key with Restricted Access` field in the Firebase Extension Configuration form.

Now hit **Install Extension**.

The extension will take a few minutes to install.

Once it has installed, navigate to **Extensions** > **Run Subscription Payments with Stripe** (Manage) > **How This Extension Works** from the firebase console.

![image.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625730639241/YTj-5idwW.png)

<br>

### Firestore Security Rules

Below are the recommended Firestore Security Rules for using this extension:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth.uid == uid;

      match /checkout_sessions/{id} {
        allow read, write: if request.auth.uid == uid;
      }
      match /subscriptions/{id} {
        allow read: if request.auth.uid == uid;
      }
    }

    match /products/{id} {
      allow read: if true;

      match /prices/{id} {
        allow read: if true;
      }

      match /tax_rates/{id} {
        allow read: if true;
      }
    }
  }
}
```

You can configure these rules by going to **Firestore Database** > **Rules**, and pasting the rules in there.

### Configure Stripe Webhooks

> You need to set up a webhook that synchronizes relevant details from Stripe with your Cloud Firestore. This includes product and pricing data from the Stripe Dashboard, as well as customer’s subscription details.

To do that, go back to your [Stripe Dashboard](https://dashboard.stripe.com/), and click **Developers** > **Webhooks**.

Copy the url from the Firebase Extension "How this extension works" tab, and paste it as a new **Endpoint** in Stripe webhooks.

Select the following events to send to that endpoint:

- `product.created`
- `product.updated`
- `product.deleted`
- `price.created`
- `price.updated`
- `price.deleted`
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `tax_rate.created` (optional)
- `tax_rate.updated` (optional)
- `invoice.paid` (optional, will sync invoices to Cloud Firestore)
- `invoice.payment_succeeded` (optional, will sync invoices to Cloud Firestore)
- `invoice.payment_failed` (optional, will sync invoices to Cloud Firestore)
- `invoice.upcoming` (optional, will sync invoices to Cloud Firestore)
- `invoice.marked_uncollectible` (optional, will sync invoices to Cloud Firestore)
- `invoice.payment_action_required` (optional, will sync invoices to Cloud Firestore)

Your webhook should look like this:

![image.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625730921797/HH_Mwh6aW.png)

Once you've done that, copy the webhook's signing secret, found here:
![web.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625731489099/xE9IKgvHm.png)

Then [Reconfigure](https://console.firebase.google.com/project/next-firebase-stripe/extensions/instances/firestore-stripe-subscriptions?tab=config) your Extension, replacing the existing placeholder value within `Stripe webhook secret` to the webhook signing secret you just copied from the Stripe Dashboard.

<br>

### Creating A Stripe Product

Back at the Stripe Dashboard, click on **Products**, and **Add Product**.

Enter the name of your product (something like "Premium Plan") and an optional description of the product.

Beneath that, open up the **additional options ** section, and add a metadata field called `firebaseRole` with the value of `premium`.

![image.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625732694667/OxibrwAX0.png)

This value will be attached to the user inside Firebase as a [custom claim](https://firebase.google.com/docs/auth/admin/custom-claims) on the user.

This allows you to quickly see if a user is a premium customer or a free customer within the Firebase User itself.

Set your monthly price for being a premium member, for example \$5.00 USD.

![image.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625732885195/YVNU1oLJz-.png)

## Testing Stripe Payments

Create two more environment variables

`NEXT_PUBLIC_STRIPE_PRODUCT_PRICE`: API ID found within the pricing section of your product in Stripe dashboard. Format example is `price_xxxxx`.

`NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY`: Publishable Key Token found in Developers > API Keys > Standard Keys > Publishable Key. Format example is `pk_test_xxxxx`.

<br>

To test a payment, click the "Upgrade to premium" button on the homepage at [http://localhost:3000](http://localhost:3000) you can use one of [Stripes test cards](https://stripe.com/docs/testing). For example `4242 4242 4242 4242`.

![checkout.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625739707231/dosfM7e0k.png)

Hit **Subscribe**, and Check out your Stripe Dashboard.

![image.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625739775121/LpsmdcyWH.png)

You should see a new customer in both Stripe and Firebase.

We can also view that customer's subscription data in their newly created `subscriptions` subcollection in Firebase:

![subcsriptions.png](https://cdn.hashnode.com/res/hashnode/image/upload/v1625740110567/e8DxvmHPy.png)
