import { HoverEffect } from '@/components/contributions-card';
import { ProjectCard } from '@/components/project-card';
import Image from 'next/image';
import { DATA } from '@/data';
import type { Metadata } from 'next';
import Markdown from 'react-markdown';

export const metadata: Metadata = {
  title: 'Projects',
  description: 'A summary of my Projects and open-source contributions.',
};

export default function ProjectsPage() {
  return (
    <section>
         
        <div className='mb-5'>
          <h2 className="font-medium text-2xl mb-8 tracking-tighter">my projects</h2>
          <div className="prose prose-neutral dark:prose-invert mb-4">
          <Markdown className="prose prose-neutral dark:prose-invert">
          {DATA.projectssummary}
        </Markdown>
        </div>
        
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-[800px] mx-auto">
            {DATA.projects.map((project, id) => (
              <div
                key={project.title}
               
              >
                <ProjectCard
                  href={project.href}
                  key={project.title}
                  title={project.title}
                  description={project.description}
                  dates={project.dates}
                  iconLists={project.iconLists}
                  image={project.image}
                  video={project.video}
                  links={project.links}
                />
              </div>
            ))}
          </div>
          <div className='mb-5 mt-12'>
          <h2 className="font-medium text-2xl mb-8 tracking-tighter">my contributions to open source world</h2>
          <div className="prose prose-neutral dark:prose-invert mb-4">
          <Markdown className="prose prose-neutral dark:prose-invert">
          {DATA.contributionssummary}
        </Markdown>
        </div>

          <HoverEffect items={DATA.contributions} />
        </div>

        <h1 className="font-medium text-2xl mt-16 mb-8 tracking-tighter">Hackathons</h1>
      <div className="prose prose-neutral dark:prose-invert">
      <Markdown className="prose prose-neutral dark:prose-invert">
          {DATA.hackathonsummary}
        </Markdown>

        {DATA.hackathons.map((hackathons, id) => (
          <div key={hackathons.id} className="flex items-start mb-6">
          
            {hackathons?.logo && (
              <Image
                src={hackathons.logo}
                alt={hackathons.title}
                height="80"
                width="80"
                className="rounded-full border-2 bg-white dark:bg-black dark:border-black border-white object-contain overflow-hidden aspect-square "
              />
            )}
            
            <div className="ml-4">
              <h2 className="font-medium text-xl mb-1 tracking-tighter">{hackathons.title}</h2>
            
              <p className="text-neutral-600 dark:text-neutral-400 text-sm">
                {hackathons.dates}, {hackathons.location}
              </p>
              <hr className="my-3 border-neutral-100 dark:border-neutral-800" />
              
             
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-1 max-w-[800px] mx-auto'>
              {hackathons?.images && (
              <Image
                src={hackathons.images}
                alt={hackathons.title}
                height="200"
                width="600"
                className=" border-2 bg-white dark:bg-black dark:border-black border-white object-contain overflow-hidden  "
              />
            )}
            </div>
            <Markdown className="prose prose-neutral dark:prose-invert mt-1">
                {hackathons.description}
              </Markdown>
             
            </div>
           
           
          </div>
          
        ))}
      </div>
          
        </div>
        
    </section>
  );
}