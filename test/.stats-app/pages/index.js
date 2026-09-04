  import Head from "next/head"
import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, ArrowUpRight } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Head>
        <title>Mimmi Lindström Schedin - Product Designer</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <header className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-sm z-50">
        <nav className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <div className="flex gap-8">
            <a href="#work" className="text-sm font-medium hover:text-blue-600 transition-colors">
              MY WORK
            </a>
            <Link href="/about" className="text-sm font-medium hover:text-blue-600 transition-colors">
              ABOUT
            </Link>
          </div>
          <h1 className="text-sm font-medium">MIMMI LINDSTRÖM SCHEDIN</h1>
        </nav>
      </header>

      <main>
        <section className="min-h-[90vh] flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-3xl text-center"
          >
            <h2 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Crafting Digital Experiences with Purpose
            </h2>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Senior Product Designer specializing in user-centered design solutions that drive business growth and user
              satisfaction.
            </p>
            <a
              href="#work"
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 md:py-4 md:text-lg md:px-10"
            >
              View My Work
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </motion.div>
        </section>

        <section id="work" className="px-4 py-24">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="grid grid-cols-1 gap-24"
            >
              {projects.map((project, index) => (
                <motion.div
                  key={project.title}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.2 }}
                  className="group"
                >
                  <div className="grid md:grid-cols-2 gap-8 items-center">
                    <div className="order-2 md:order-1">
                      <div className="space-y-6">
                        <div className="flex gap-2 flex-wrap">
                          {project.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-3 py-1 bg-gray-100 text-gray-800 text-sm font-medium rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <h3 className="text-3xl font-bold">{project.title}</h3>
                        <p className="text-lg text-gray-600">{project.description}</p>
                        <div className="space-y-4">
                          <div className="flex items-center gap-8">
                            <div>
                              <div className="text-sm text-gray-500 mb-1">Timeline</div>
                              <div className="font-medium">{project.timeline}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500 mb-1">Role</div>
                              <div className="font-medium">{project.role}</div>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-500 mb-1">Impact</div>
                            <div className="font-medium">{project.impact}</div>
                          </div>
                        </div>
                        <a href="#" className="inline-flex items-center text-blue-600 hover:text-blue-800">
                          View Case Study
                          <ArrowUpRight className="ml-2 h-5 w-5" />
                        </a>
                      </div>
                    </div>
                    <div className="order-1 md:order-2">
                      <div className="relative aspect-[4/3] rounded-lg overflow-hidden">
                        <Image
                          src={project.image || "/placeholder.svg"}
                          alt={project.title}
                          layout="fill"
                          objectFit="cover"
                          className="transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      </main>
    </div>
  )
}

const projects = [
  {
    title: "Recipe Platform UX Design",
    description:
      "Redesigned the social cooking platform to improve user engagement and recipe discovery, resulting in a more intuitive and engaging experience for food enthusiasts.",
    image: "/placeholder.svg?height=800&width=1200",
    tags: ["UX Design", "Social Platform", "Mobile App"],
    timeline: "6 months",
    role: "Lead Product Designer",
    impact: "40% increase in user engagement, 60% improvement in recipe sharing",
  },
  {
    title: "Port Visualization System",
    description:
      "Created an innovative data visualization system for maritime logistics, simplifying complex port operations and improving efficiency.",
    image: "/placeholder.svg?height=800&width=1200",
    tags: ["Data Visualization", "Enterprise", "Dashboard"],
    timeline: "8 months",
    role: "Senior Product Designer",
    impact: "30% reduction in operation planning time",
  },
  {
    title: "Home Brewing Experience",
    description:
      "Designed a connected device ecosystem and mobile app for home brewing enthusiasts, making the brewing process more accessible and enjoyable.",
    image: "/placeholder.svg?height=800&width=1200",
    tags: ["IoT", "Mobile App", "Hardware"],
    timeline: "12 months",
    role: "Product Design Lead",
    impact: "90% user satisfaction rate, 50k+ active users",
  },
]

