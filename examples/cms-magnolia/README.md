# A server rendered page using Next.js and Magnolia

This powerful synergy brings together Vercel's seamless deployment and scaling capabilities with Magnolia's robust full-page editing experience for Next.js projects.

### Related examples

- [AgilityCMS](/examples/cms-agilitycms)
- [Builder.io](/examples/cms-builder-io)
- [ButterCMS](/examples/cms-buttercms)
- [Contentful](/examples/cms-contentful)
- [Cosmic](/examples/cms-cosmic)
- [DatoCMS](/examples/cms-datocms)
- [DotCMS](/examples/cms-dotcms)
- [Drupal](/examples/cms-drupal)
- [Enterspeed](/examples/cms-enterspeed)
- [Ghost](/examples/cms-ghost)
- [GraphCMS](/examples/cms-graphcms)
- [Kontent](/examples/cms-kontent-ai)
- [Prepr](/examples/cms-prepr)
- [Prismic](/examples/cms-prismic)
- [Sanity](/examples/cms-sanity)
- [Sitefinity](/examples/cms-sitefinity)
- [Storyblok](/examples/cms-storyblok)
- [TakeShape](/examples/cms-takeshape)
- [Umbraco heartcore](/examples/cms-umbraco-heartcore)
- [Webiny](/examples/cms-webiny)
- [Blog Starter](/examples/blog-starter)
- [WordPress](/examples/cms-wordpress)

## How to use

# Overview

Embrace the future of web development with the groundbreaking integration of [Vercel](https://vercel.com/) into [Magnolia DXP](https://www.magnolia-cms.com).
This powerful synergy brings together Vercel's seamless deployment and scaling capabilities with Magnolia's robust full-page editing experience for Next.js projects.

With light modules, developers can rapidly prototype using low-code solutions, accelerating the go-to-market process.
Plus, our versatile webhook functionality ensures your projects stay reactive and synchronized with your dynamic content needs.

## Elevate your web presence

Don't just build—innovate and lead with Vercel and Magnolia DXP, where cutting-edge performance meets unmatched user experience.

## How we will integrate with Vercel

We will use a local version of Magnolia to create a new project. We will then proceed to expose this local instance to the internet using LocalTunnels. Once this is done we will add the public URL to Vercel to connect the two.

# Magnolia CLI

Before we initiate the integration process, ensure that the Magnolia Command Line Interface (CLI) is installed on your system.
The CLI is a prerequisite that facilitates the creation, development, and maintenance of your Magnolia projects.

To successfully install the Magnolia CLI, your machine must have Node.js and Java already installed.
These foundational platforms are crucial for running the CLI tool.

If the Magnolia CLI is not yet part of your development toolkit, please refer to the comprehensive installation instructions provided at the following [Magnolia CLI Installation Guide](xref:magnolia-cli:ROOT:index.adoc).
You don't have to read the whole docs, you just need to follow the installation instructions.

## After CLI is installed

Once you have the Magnolia CLI installed and set up on your machine, you can easily install Magnolia using the `mgnl jumpstart` command.

Open your command line interface, and navigate to the directory where you want Magnolia to be installed.
Run `mgnl jumpstart`.

This command automatically downloads and sets up the latest version of Magnolia for you.

To launch your newly installed Magnolia instance, run the command `mgnl start`.
Click on _Run the Web update_ on the author instance and when prompted, enter "superuser" for both the username and password.

Once Magnolia is installed and up and running, we will proceed to expose your local instance to the public internet, enabling your Vercel-deployed Next.js application to interact with Magnolia's content APIs.

# Integrate Vercel

Welcome to the Magnolia Vercel integration guide.
Follow these instructions to enhance your Magnolia instance with Vercel's powerful capabilities.

## Download Light Modules

Once you have your Magnolia instance up and running, you will need to incorporate some specific Light Modules to leverage the full potential of the Vercel integration.

Visit the following URL to access the Light Modules repository:

[https://github.com/magnolia-cms/magnolia-vercel-light-modules](https://github.com/magnolia-cms/magnolia-vercel-light-modules)

- Download the folder `spa-lm`.
- Locate the `light-modules` directory within your local Magnolia instance.
- Copy the downloaded `spa-lm` folders and paste them directly into your Magnolia `light-modules` folder.

- The `light-modules` directory is where Magnolia looks for custom modules, and by placing the `spa-lm` folders there, you're integrating new functionality into your Magnolia CMS.

## Configure the Vercel Magnolia page

The `spa-lm` light module contains template definitions that allow you to create a "Vercel Magnolia" page within your Magnolia CMS. To configure this page:

- Navigate to the `spa-lm/templates/pages/` directory.
- Open the `basic.yaml` file. This file contains the necessary configuration for your "Vercel Magnolia" page.
- In the `basic.yaml` file, where the `baseUrl` property is defined.

  `baseUrl: http://localhost:3000`

  The `baseUrl` property is typically found at the top of the file around Line 4.

The `baseUrl` is initially set to `http://localhost:3000`.
This should point to the domain where your Vercel application is accessible.

While you are developing locally, you can leave the `baseUrl` set to `localhost:3000`.
Once you are ready to deploy and have your Vercel application hosted publicly, you need to update this `baseUrl` with your public Vercel domain name.

After setting up the `baseUrl`, you can proceed to create a "Vercel Magnolia" page in the Magnolia AdminCentral.
Your new page will utilize this configuration to connect with your Vercel deployment, enabling a seamless development and testing experience.

# LocalTunnel

## Understand the `.env` File

In your Next.js project, the `.env` file holds crucial environment variables. A key variable is `NEXT_PUBLIC_MGNL_HOST`, which points to your Magnolia CMS instance, ensuring your Next.js application can communicate with Magnolia.

## Set `NEXT_PUBLIC_MGNL_HOST`

- `NEXT_PUBLIC_MGNL_HOST` should be set to the URL of your accessible Magnolia instance.
- For local development, typically use `http://localhost:8080`.
- For the Vercel deployment, we will need to use a public URL for your Magnolia instance.

## Expose Your Localhost with LocalTunnel

Since you want to deploy to the cloud but your Magnolia instance is running on localhost, you need a way to expose your localhost to the internet. **LocalTunnel** is a tool that enables you to do this easily.

1. Go to [LocalTunnel](https://theboroer.github.io/localtunnel-www/).
2. Install LocalTunnel.

   ```shell
   npm install -g localtunnel
   ```

3. Ensure your Magnolia instance is running, typically at `http://localhost:8080`.
4. Run the following in your terminal to expose `localhost` to LocalTunnel.

   ```shell
   lt --port 8080 # Where `8080` is your desired port.
   ```

   LocalTunnel will provide a URL, which will be your localhost Magnolia instance accessible from anywhere. We will call this your LocalTunnel URL. Go to the LocalTunnel URL in your browser to complete the final steps.

5. Complete the process by following the instructions on the LocalTunnel's website or read the [LocalTunnel Instructions](#localtunnel) section below.

## LocalTunnel

Access your Magnolia instance on the public domain by obtaining your local IP address.

1. Go to [IPv4 Address Display](https://ipv4.icanhazip.com) to display your public `IPv4` address.
2. Copy the displayed IP address for the next step.
3. Return to your LocalTunnel URL page.
4. In the `"Endpoint IP:"` field, paste your copied IP address.

   NOTE: You'll be redirected to your Magnolia instance on the public domain. It will be something like `https://chilly-zoos-rule.loca.lt` this will be used in the next section by replacing the `YOUR_LOCAL_TUNNEL_URL` value assigned to the `NEXT_PUBLIC_MGNL_HOST`.

5. Click "Run the Web update" on the author instance. Log in upon reaching your Magnolia instance, typically using the `superuser` account.

# Magnolia-integrated Next.js to Vercel

## Prerequisites

You should have Git installed and configured.
Have an account on GitHub (or GitLab/Bitbucket as per your preference).
Make sure you have an account on Vercel.

## Step 1: Create your Next.js project

Run the following command.

`npx create-next-app --example cms-magnolia cms-magnolia-app`

This command creates a new Next.js project using the `cms-magnolia` example in a directory named `cms-magnolia-app`.

Navigate to your project directory.

Or you can go to a GitHub repo and fork it.

**Fork the Repository**:

- Visit [https://github.com/magnolia-cms/magnolia-vercel-nextjs](https://github.com/magnolia-cms/magnolia-vercel-nextjs).
- On the repository page, click the `Fork` button at the top right corner to create a fork of the repository under your GitHub account.

- cd `my-nextjs-project`

## Step 2: Push the project to your repository

Initialize a Git repository.

    git init

Add your files to the repository.

    git add .

Commit the files.

    git commit -m "Initial commit with Magnolia-Vercel Next.js project"

Push to your GitHub repository.

You may need to create a new repository on GitHub.
Follow the instructions to push your local repository to GitHub.
It will look something like this:

    git remote add origin <your-repository-url>
    git branch -M main
    git push -u origin main

---

## Step 3: Connect Your Repository to Vercel

- Log in to Vercel.
- Import your project.
  - Click on “New Project”.
  - Choose to import a project from a Git repository.
  - Follow the prompts to connect Vercel to your GitHub account (_if not already connected_).
- Set up Vercel Git integration:
  - Select your GitHub repository with the Next.js project.
  - Vercel detects that it's a Next.js project and sets up the build settings automatically.
  - Now you can add the environment variables for Magnolia before you deploy the project.
- Set up environment variables:

  - Click on “Environment Variables”.
  - Add the following environment variables:

  ```bash
  NEXT_PUBLIC_MGNL_HOST=YOUR_LOCAL_TUNNEL_URL
  NEXT_APP_MGNL_SITE_PATH="/vercel-demo"
  ```

Click on “Deploy”.

Deployment:

Vercel will begin deploying your project.
Once the deployment is complete, you'll receive a URL to view your live project.
There will probably nothing displayed at this point, but we will fix that in the next steps.

## Step 4: Verify Your Deployment

Check your Vercel dashboard.
Go back to your Vercel dashboard.
You should now see your new Next.js project (integrated with Magnolia) listed there.

## Step 5: Getting your Vercel Domain URL and setting it in Magnolia

Get your Vercel domain URL. By clicking on the Visit button this will open a new tab with your project. Copy the URL from the address bar. Take this URL and go to your Magnolia code base remember the file called `spa-lm/templates/pages/basic.yaml`

In this file you will find the following lines:

Replace the `http://localhost:3000` with the URL you copied from Vercel. Something like this: `https://my-nextjs-project.vercel.app`

NOTE: You don't have to do anything else to deploy your project. We will go forward and set the environment variables which will be the connection into Magnolia in the next steps.

# Adding a Page in Magnolia CMS

This section will walk you through the steps to add a new page in Magnolia CMS, specifically using the 'Next.js SSR: Basic' template and naming the page 'vercel-demo', in line with the environment variable `NEXT_APP_MGNL_SITE_PATH`.

## Navigating to the Pages App

. **Open the Pages App**:

- Navigate to the pages app within the Magnolia CMS interface.

## Adding a New Page

. **Initiate Page Creation**:

- Click on the option to add a new page by clicking 'Add page' button.

. **Select the Template**:

- Choose the 'Next.js SSR: Basic' template from the list of available templates. This template is designed for server-side rendered Next.js pages.

. **Name Your Page**:

- Name your new page 'vercel-demo'. Ensure that it aligns with the `NEXT_APP_MGNL_SITE_PATH` environment variable set in your project.

## Customizing the Page

. **Add Components to Your Page**:

- After the page is created, you can start adding components.
- Look for the green bars in the page editor, which represent areas where you can add new components.

You should see the Next JS app that was deployed to Vercel in the WSYWIG editor. Now you can make changes to the page and see them reflected in the editor and on the live site.
