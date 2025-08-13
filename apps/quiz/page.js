npx shadcn@latest add "https://v0.dev/chat/b/b_EmBcOVcvKkF?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..1hj4tholFm4CyspD.B2f0623OZUK3ziYXIQ24djWxbXvNaW3G-e6GWdHysnqsRi8CJJiAbM9FBFs.ap5LiydS296eX0K93pY68A"
"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Navigation from "../components/Navigation"
import { Search, Settings, CheckCircle, Target, Users, TrendingUp, Star, Quote } from 'lucide-react'

export default function Homepage() {
  const services = [
    {
      icon: Search,
      title: "Sales Leak Audit",
      description: "We identify exactly where your leads are slipping through the cracks and costing you money.",
    },
    {
      icon: Settings,
      title: "CRM & Automation Setup",
      description: "Custom systems that follow up with leads automatically so nothing falls through the cracks.",
    },
    {
      icon: Target,
      title: "Sales Process Design",
      description: "Step-by-step systems that turn your team into consistent closers, not order-takers.",
    },
    {
      icon: Users,
      title: "Team Training",
      description: "We train your people to sell with confidence and handle objections like pros.",
    },
    {
      icon: TrendingUp,
      title: "Performance Tracking",
      description: "Dashboards and metrics that show you exactly what's working and what needs fixing.",
    },
  ]

  const audienceFit = [
    "You're getting leads but they're not converting into jobs",
    "Your team struggles with follow-up and lets opportunities slip away",
    "You're tired of competing on price instead of value",
    "Your sales process is inconsistent and depends on luck",
    "You want systems that work even when you're not there",
    "You're ready to invest in real solutions, not quick fixes",
  ]

  const differentiators = [
    {
      title: "Built by Someone Who's Done the Work",
      description:
        "I've run excavators, installed electrical panels, and closed million-dollar deals. I understand your business because I've lived it.",
    },
    {
      title: "No Fluff, Just Results",
      description:
        "We don't waste time with theory. Every system we build is tested in the real world and proven to work.",
    },
    {
      title: "Industry-Specific Solutions",
      description:
        "Construction, HVAC, plumbing, electrical—we know your industry's unique challenges and how to solve them.",
    },
    {
      title: "Implementation, Not Just Consulting",
      description: "We don't just tell you what to do. We build it, set it up, and train your team to use it.",
    },
  ]

  const testimonials = [
    {
      quote:
        "We went from 12% close rate to 47% in 8 months. The follow-up system alone recovered $180K in quoted work that was sitting in limbo.",
      author: "Mike Rodriguez",
      company: "Metro Construction Co.",
      industry: "Commercial Electrical",
    },
    {
      quote:
        "Our conversion rate doubled and we're closing deals from leads that were 8 months old. The nurture system is a game-changer.",
      author: "Jennifer Martinez",
      company: "Premier Realty Group",
      industry: "Real Estate",
    },
    {
      quote:
        "My techs went from order-takers to confident salespeople. We added $180K in additional revenue in just 4 months.",
      author: "Tom Wilson",
      company: "Apex HVAC Services",
      industry: "HVAC",
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      {/* Hero Section */}
      <section className="relative py-20 px-6 overflow-hidden bg-[#0D2C54]">
        {/* Large Logo Background */}
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          <img
            src="/images/ess-logo.png"
            alt="ESS Logo Background"
            className="w-[600px] h-[600px] object-contain brightness-0 invert"
          />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center text-white">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            We Fix Broken Sales Systems for Blue-Collar Businesses
          </h1>
          <p className="text-xl md:text-2xl mb-8 opacity-90">
            Stop losing money on leads that should be customers. We build sales systems that actually work for
            contractors, service companies, and trades.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Link href="/book">
              <Button className="bg-[#F2C038] hover:bg-[#F2C038]/90 text-black px-8 py-4 text-lg font-semibold transition-all">
                📋 Get Your Free Sales Audit ($297 Value)
              </Button>
            </Link>
            <p className="text-sm opacity-75">30-minute call • No pitch • Just actionable insights</p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-2xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-[#F2C038]">500+</div>
              <div className="text-sm opacity-75">Businesses Fixed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-[#F2C038]">$2.5M+</div>
              <div className="text-sm opacity-75">Revenue Recovered</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-[#F2C038]">156%</div>
              <div className="text-sm opacity-75">Avg. Improvement</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-[#F2C038]">15+</div>
              <div className="text-sm opacity-75">Years Experience</div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission/Vision */}
      <section className="py-20 px-6 bg-[#F5F5F5]">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6 text-[#1C1C1C]">
                Built by a Contractor. Run Like a Sales Machine.
              </h2>
              <p className="text-xl mb-6 text-[#4F4F4F]">
                I didn't learn sales from a textbook. I learned it in the trenches—running job sites, managing crews,
                and closing deals that kept the lights on.
              </p>
              <p className="text-lg mb-8 text-[#4F4F4F]">
                Now I take that real-world experience and engineer sales systems that work for businesses like yours. No
                corporate fluff. No one-size-fits-all solutions. Just proven systems that turn leads into customers and
                customers into profit.
              </p>
              <div className="flex items-center gap-4">
                <img src="/images/headshot.jpg" alt="Founder" className="w-16 h-16 rounded-full object-cover" />
                <div>
                  <div className="font-semibold text-[#1C1C1C]">Founder & Lead Consultant</div>
                  <div className="text-sm text-[#4F4F4F]">15+ Years | Blue-Collar to Boardroom</div>
                </div>
              </div>
            </div>
            <div className="text-center">
              <img
                src="/images/job-site.jpg"
                alt="Real work experience"
                className="w-full max-w-md mx-auto rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-4xl font-bold mb-6 text-[#1C1C1C]">What We Build For You</h3>
            <p className="text-xl text-[#4F4F4F]">We don't just consult—we build, implement, and train. Here's what you get:</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service, index) => {
              const IconComponent = service.icon
              return (
                <Card key={index} className="h-full border-2 border-[#0D2C54] hover:shadow-lg transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 bg-[#F2C038] rounded-lg flex items-center justify-center mb-4">
                      <IconComponent className="w-6 h-6 text-[#1C1C1C]" />
                    </div>
                    <h4 className="text-xl font-bold mb-3 text-[#1C1C1C]">{service.title}</h4>
                    <p className="text-[#4F4F4F]">{service.description}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Audience Fit */}
      <section className="py-20 px-6 bg-[#F5F5F5]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h3 className="text-4xl font-bold mb-6 text-[#1C1C1C]">Is This You?</h3>
            <p className="text-xl text-[#4F4F4F]">If any of these sound familiar, we can help:</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {audienceFit.map((point, index) => (
              <div key={index} className="flex items-start gap-4 p-4 bg-white rounded-lg shadow-sm">
                <div className="w-6 h-6 bg-[#F2C038] rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <CheckCircle className="w-4 h-4 text-[#1C1C1C]" />
                </div>
                <p className="text-[#4F4F4F]">{point}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link href="/book">
              <Button className="bg-[#F2C038] hover:bg-[#F2C038]/90 text-black px-8 py-4 text-lg font-semibold transition-all">
                Yes, That's Me - Let's Fix It
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Differentiators */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-4xl font-bold mb-6 text-[#1C1C1C]">Why Engineered Success Works</h3>
            <p className="text-xl text-[#4F4F4F]">We're not your typical sales consultants. Here's what makes us different:</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {differentiators.map((diff, index) => (
              <Card key={index} className="p-6 border-l-4 border-l-[#0D2C54]">
                <CardContent className="p-0">
                  <h4 className="text-xl font-bold mb-3 text-[#1C1C1C]">{diff.title}</h4>
                  <p className="text-[#4F4F4F]">{diff.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-6 bg-[#F5F5F5]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-4xl font-bold mb-6 text-[#1C1C1C]">You're Not the Only One Who Needed a Fix</h3>
            <p className="text-xl text-[#4F4F4F]">Here's what happened when we fixed their broken sales systems:</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="p-6 bg-white shadow-lg">
                <CardContent className="p-0">
                  <div className="flex justify-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-[#F2C038] text-[#F2C038]" />
                    ))}
                  </div>
                  <Quote className="w-8 h-8 mb-4 mx-auto text-[#0D2C54]" />
                  <blockquote className="text-lg mb-6 italic text-[#4F4F4F]">"{testimonial.quote}"</blockquote>
                  <div className="text-center">
                    <div className="font-semibold text-[#1C1C1C]">— {testimonial.author}</div>
                    <div className="text-sm text-[#4F4F4F]">{testimonial.company}</div>
                    <div className="text-xs text-[#4F4F4F]">{testimonial.industry}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-20 px-6 bg-[#0D2C54]">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h3 className="text-4xl md:text-5xl font-bold mb-6">Let's Find the Leaks in Your Sales Process</h3>
          <p className="text-xl mb-8 opacity-90">
            Book your free 30-minute Sales Leak Audit. We'll show you exactly where you're losing money and how to fix
            it—no pitch, just results.
          </p>

          <div className="mb-8">
            <Link href="/book">
              <Button className="bg-[#F2C038] hover:bg-[#F2C038]/90 text-black px-8 py-4 text-xl font-semibold transition-all">
                📞 Book My Free Sales Audit Now
              </Button>
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-2xl font-bold text-[#F2C038]">30 Minutes</div>
              <div className="text-sm opacity-75">That's all it takes</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#F2C038]">$297 Value</div>
              <div className="text-sm opacity-75">Completely free</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#F2C038]">No Pitch</div>
              <div className="text-sm opacity-75">Just actionable insights</div>
            </div>
          </div>

          <p className="text-sm mt-8 opacity-75">
            100% satisfaction guarantee • If you don't find at least 3 actionable ways to improve your sales process,
            we'll send you a $100 Amazon gift card.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-[#1C1C1C] text-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <img
                src="/images/ess-logo.png"
                alt="Engineered Success Sales"
                className="h-12 w-auto mb-4 brightness-0 invert"
              />
              <p className="text-gray-400">
                Sales systems that actually work for blue-collar and service-based businesses.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Services</h4>
              <div className="space-y-2 text-gray-400">
                <div>Sales Leak Audit</div>
                <div>CRM Setup</div>
                <div>Process Design</div>
                <div>Team Training</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Industries</h4>
              <div className="space-y-2 text-gray-400">
                <div>Construction</div>
                <div>HVAC</div>
                <div>Plumbing</div>
                <div>Electrical</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Get Started</h4>
              <Link href="/book">
                <Button className="bg-[#F2C038] hover:bg-[#F2C038]/90 text-black font-semibold w-full mb-4">
                  Book Free Audit
                </Button>
              </Link>
              <p className="text-sm text-gray-400">
                15+ years experience
                <br />
                500+ businesses helped
                <br />
                $2.5M+ revenue generated
              </p>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Engineered Success Sales. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
