import { Suspense } from 'react';
import { DATA } from '@/data';
import Image from 'next/image';
import Markdown from 'react-markdown';
import GitHubInfo from '@/components/githubinfo';
import TweetList from '@/components/tweetlist';

function Badge(props: any) {
  return (
    <a
      {...props}
      target="_blank"
      className="inline-flex items-center rounded border border-neutral-200 bg-neutral-50 p-1 text-sm leading-4 text-neutral-900 no-underline dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
    />
  );
}

function ArrowIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.07102 11.3494L0.963068 10.2415L9.2017 1.98864H2.83807L2.85227 0.454545H11.8438V9.46023H10.2955L10.3097 3.09659L2.07102 11.3494Z"
        fill="currentColor"
      />
    </svg>
  );
}


function LinkedinLink({ img, link, name }: { img: string, link: string, name: string }) {
    return (
      <div className="group flex w-full">
        <a
          href={link}
          target="_blank"
          className="flex w-full items-center justify-between rounded border border-neutral-200 bg-neutral-50 px-3 py-4 dark:border-neutral-700 dark:bg-neutral-800"
        >
          <div className="flex items-center space-x-3">
            <div className="relative h-16">
              <Image
                alt={name}
                src={img}
                height={64}
                width={64}
                sizes="33vw"
                className="h-16 w-16 rounded-full border object-cover border-neutral-200 dark:border-neutral-700"
                priority
              />
              <div className="relative -right-10 -top-6 inline-flex h-6 w-6 items-center rounded-full border border-neutral-200 bg-white p-1 dark:border-neutral-700">
              <img
              alt="linkedin logo"
              src={DATA.linkedin[0].icon}
              width="14"
              height="14"
            />
              </div>
            </div>
            <div className="flex flex-col">
              <p className="font-medium text-neutral-900 dark:text-neutral-100">
                {name}
              </p>
            </div>
          </div>
          <div className="transform text-neutral-700 transition-transform duration-300 group-hover:-rotate-12 dark:text-neutral-300">
            <ArrowIcon />
          </div>
        </a>
      </div>
    );
  }


  function GithubLink({ img, link, name }: { img: string, link: string, name: string }) {
    return (
      <div className="group flex w-full">
        <a
          href={link}
          target="_blank"
          className="flex w-full items-center justify-between rounded border border-neutral-200 bg-neutral-50 px-3 py-4 dark:border-neutral-700 dark:bg-neutral-800"
        >
          <div className="flex items-center space-x-3">
            <div className="relative h-16">
              <Image
                alt={name}
                src={img}
                height={64}
                width={64}
                sizes="33vw"
                className="h-16 w-16 rounded-full border border-neutral-200 dark:border-neutral-700"
                priority
              />
              <div className="relative -right-10 -top-6 inline-flex h-6 w-6 items-center rounded-full border border-neutral-200 bg-white p-1 dark:border-neutral-700">
              <img
              alt="github logo"
              src={DATA.github[0].icon}
              width="20"
              height="14"
            />
              </div>
            </div>
            <div className="flex flex-col">
              <p className="font-medium text-neutral-900 dark:text-neutral-100">
                {name}
              </p>
              <Suspense fallback={<p className="h-6 text-sm" />}>
              <GitHubInfo username={DATA.github[0].title} />
               
              </Suspense>
            </div>
          </div>
          <div className="transform text-neutral-700 transition-transform duration-300 group-hover:-rotate-12 dark:text-neutral-300">
            <ArrowIcon />
          </div>
        </a>
      </div>
    );
  }

export default function Page() {
  return (
    <section>
     
      <h1 className="mb-3 text-2xl font-medium tracking-tighter">
        hey, I&apos;m {DATA.name} 👋
      </h1>
      
      <hr className="my-2 border-neutral-100 dark:border-neutral-800" />
      <p className="prose prose-neutral w-full dark:prose-invert">
        {DATA.description}
        
        <span className="not-prose ml-2 mr-2">
          <Badge href={DATA.Iconsvg[0].site}>
            <img
              alt={DATA.Iconsvg[0].title}
              src={DATA.Iconsvg[0].href}
              className="!mr-1"
              width="14"
              height="14"
            />
            {DATA.Iconsvg[0].title}
          </Badge>
        </span>
        {DATA.description2}
        <span className="not-prose ml-2 mr-2">
        <Badge href={DATA.Iconsvg[1].site}>
          <img
            alt={DATA.Iconsvg[1].title}
            src={DATA.Iconsvg[1].href}
            className="!mr-1"
            width="14"
            height="14"
          />
          {DATA.Iconsvg[1].title}
        </Badge>
        </span>
        {DATA.description3}
        <span className="not-prose ml-2">
        <Badge href={DATA.Iconsvg[2].site}>
        <img
            alt={DATA.Iconsvg[2].title}
            src={DATA.Iconsvg[2].href}
            className="!mr-1"
            width="14"
            height="14"
          />
         {DATA.Iconsvg[2].title}
        </Badge>
        </span>
      </p>
      <div className="grid grid-cols-2 grid-rows-4 sm:grid-rows-3 sm:grid-cols-3 gap-4 my-8">
        <div className="relative h-40">
          <Image
            alt={DATA.images[0].title}
            src={DATA.images[0].href}
            fill
            sizes="(max-width: 768px) 213px, 33vw"
            priority
            className="rounded-lg object-cover"
          />
        </div>
        <div className="relative sm:row-span-2 row-span-1">
          <Image
            alt={DATA.images[1].title}
            src={DATA.images[1].href}
            fill
            sizes="(max-width: 768px) 213px, 33vw"
            priority
            className="rounded-lg object-cover object-top sm:object-center"
          />
        </div>
        <div className="relative">
          <Image
            alt={DATA.images[2].title}
            src={DATA.images[2].href}
            fill
            sizes="(max-width: 768px) 213px, 33vw"
            priority
            className="rounded-lg object-cover"
          />
        </div>
        <div className="relative row-span-2">
          <Image
            alt={DATA.images[3].title}
            src={DATA.images[3].href}
            fill
            sizes="(max-width: 768px) 213px, 33vw"
            priority
            className="rounded-lg object-cover sm:object-center"
          />
        </div>
        <div className="relative row-span-2">
          <Image
             alt={DATA.images[4].title}
             src={DATA.images[4].href}
            fill
            sizes="(max-width: 768px) 213px, 33vw"
            priority
            className="rounded-lg object-cover"
          />
        </div>
        <div className="relative h-40">
          <Image
            alt={DATA.images[5].title}
            src={DATA.images[5].href}
            fill
            sizes="(max-width: 768px) 213px, 33vw"
            priority
            className="rounded-lg object-cover"
          />
        </div>
      </div>

      <div className="prose prose-neutral dark:prose-invert">
      <Markdown className="prose max-w-full prose-neutral  text-muted-foreground dark:prose-invert">
            {DATA.summary}
        </Markdown>
      </div>
      <div className="my-8 flex w-full flex-col space-x-0 space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0">
        <LinkedinLink
          img={DATA.linkedin[0].profile}
          name={DATA.linkedin[0].title}
          link={DATA.linkedin[0].href}
        />
        <GithubLink
          img={DATA.github[0].profile}
          name={DATA.github[0].title}
          link={DATA.github[0].href}                 
          />
      </div>
      <div className="prose prose-neutral dark:prose-invert">
      <Markdown className="prose max-w-full prose-neutral  text-muted-foreground dark:prose-invert">
            {DATA.apperciation}
        </Markdown>
      </div>
      <div className="my-8 flex w-full flex-col space-y-4">
      <TweetList/>
      </div>
      <div className="prose prose-neutral dark:prose-invert">
      <Markdown className="prose max-w-full prose-neutral  text-muted-foreground dark:prose-invert">
            {DATA.footer}
        </Markdown>
      </div>
      
    </section>
  );
}
