"use client"

import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import Image from "next/image"
import Link from "next/link"
import {
  Code,
  Brain,
  Layers,
  Lightbulb,
  Award,
  Mail,
  ExternalLink,
  GraduationCap,
  Sparkles,
  Zap,
  Globe,
  Users,
  Calendar,
  Rocket,
  Target,
  Heart,
} from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

export default function AboutPage() {
  usePageTitle('About')
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />

      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-texture" />

      {/* Navigation */}
      <Navigation />

      {/* Main Content */}
      <main className="relative z-10 pt-16 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Section */}
          <div className="text-center mb-16 max-w-4xl mx-auto">
            <Badge className="mb-4 bg-purple-500/20 text-purple-300 border-purple-500/30">
              About Us
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
              Building the Future of
              <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"> AI-Powered Development</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              PiPilot is revolutionizing how developers and businesses create web applications
              through the power of artificial intelligence and cutting-edge technology.
            </p>
            <div className="mt-6 flex items-center justify-center">
              <a href="https://e2b.dev/startups" target="_blank" rel="noopener noreferrer" className="opacity-80 hover:opacity-100 transition-opacity">
                <img src="/e2b-badge.svg" alt="Sponsored by E2B for Startups" className="h-8 md:h-10 w-auto rounded" />
              </a>
            </div>
          </div>

          {/* About PiPilot Section */}
          <div className="max-w-6xl mx-auto mb-20">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold text-white mb-6">What is PiPilot?</h2>
                <p className="text-gray-300 mb-4 leading-relaxed">
                  PiPilot is an AI-powered application builder that transforms the way you create web applications.
                  Our platform combines advanced artificial intelligence with intuitive design tools to help you
                  build, deploy, and scale applications faster than ever before.
                </p>
                <p className="text-gray-300 mb-6 leading-relaxed">
                  Whether you're a seasoned developer looking to accelerate your workflow or a business owner
                  wanting to bring your ideas to life, PiPilot provides the tools and intelligence you need
                  to succeed in today's fast-paced digital landscape.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="outline" className="text-purple-300 border-purple-500/50">
                    <Sparkles className="h-3 w-3 mr-1" /> AI-Powered
                  </Badge>
                  <Badge variant="outline" className="text-blue-300 border-blue-500/50">
                    <Zap className="h-3 w-3 mr-1" /> Lightning Fast
                  </Badge>
                  <Badge variant="outline" className="text-green-300 border-green-500/50">
                    <Globe className="h-3 w-3 mr-1" /> Global Scale
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardContent className="p-6 text-center">
                    <Code className="h-8 w-8 text-purple-400 mx-auto mb-3" />
                    <h3 className="text-white font-semibold mb-1">Smart Coding</h3>
                    <p className="text-gray-400 text-sm">AI-assisted development</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardContent className="p-6 text-center">
                    <Brain className="h-8 w-8 text-pink-400 mx-auto mb-3" />
                    <h3 className="text-white font-semibold mb-1">AI Memory</h3>
                    <p className="text-gray-400 text-sm">Context-aware assistance</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardContent className="p-6 text-center">
                    <Layers className="h-8 w-8 text-blue-400 mx-auto mb-3" />
                    <h3 className="text-white font-semibold mb-1">Full Stack</h3>
                    <p className="text-gray-400 text-sm">Complete solutions</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardContent className="p-6 text-center">
                    <Users className="h-8 w-8 text-green-400 mx-auto mb-3" />
                    <h3 className="text-white font-semibold mb-1">Team Ready</h3>
                    <p className="text-gray-400 text-sm">Collaboration built-in</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* The Origin Story Section */}
          <div className="max-w-4xl mx-auto mb-20">
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-orange-500/20 text-orange-300 border-orange-500/30">
                <Calendar className="h-3 w-3 mr-1" /> July 29, 2025
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                The Day Everything Changed
              </h2>
              <p className="text-gray-400">How frustration became the fuel for innovation</p>
            </div>

            <div className="bg-gradient-to-br from-gray-800/70 to-gray-900/70 backdrop-blur-sm rounded-2xl p-8 md:p-10 border border-gray-700 relative overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-500/10 rounded-full blur-3xl" />

              <div className="relative z-10 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <Target className="h-6 w-6 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">The Frustration</h3>
                    <p className="text-gray-300 leading-relaxed">
                      It was late July 2025, and I found myself staring at my screen for the hundredth time that week,
                      wrestling with the same repetitive tasks. I had tried every AI-powered development tool on the market—
                      <span className="text-white"> Lovable, Bolt, Cursor, Windsurf</span>—you name it, I used it.
                      But none of them delivered what I truly needed: <span className="text-purple-400 font-medium">complete automation</span>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <Lightbulb className="h-6 w-6 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">The Breaking Point</h3>
                    <p className="text-gray-300 leading-relaxed">
                      Every tool promised to revolutionize my workflow, but they all fell short. I was still manually
                      configuring environments, still copying and pasting code between windows, still babysitting AI
                      that couldn't remember what we discussed five minutes ago. The tools were smart, sure—but they
                      weren't <span className="text-white">intelligent enough</span>. They couldn't think ahead. They
                      couldn't understand context. They couldn't give me the <span className="text-pink-400 font-medium">true freedom</span>
                      to just describe what I wanted and watch it come to life.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <Rocket className="h-6 w-6 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">The Decision</h3>
                    <p className="text-gray-300 leading-relaxed">
                      On <span className="text-white font-semibold">July 29, 2025</span>, I made a decision that would change everything.
                      Instead of waiting for someone else to build the tool I desperately needed, I decided to build it myself.
                      If the existing tools couldn't give me full automation—the ability to truly converse with an AI that
                      understands my project, remembers our history, and executes complete workflows without constant
                      hand-holding—then I would create one that could.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <Heart className="h-6 w-6 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">The Birth of PiPilot</h3>
                    <p className="text-gray-300 leading-relaxed">
                      And so PiPilot was born—not in a boardroom, not from a business plan, but from genuine frustration
                      and a relentless drive to solve a problem I lived with every single day. I built PiPilot for
                      developers like me: people who don't want to fight their tools, who want AI that truly
                      <span className="text-purple-400 font-medium"> understands</span>,
                      <span className="text-pink-400 font-medium"> remembers</span>, and
                      <span className="text-blue-400 font-medium"> delivers</span>.
                      Today, PiPilot represents everything I wished existed back then—and everything I'm committed to
                      making even better for developers around the world.
                    </p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-700">
                  <p className="text-gray-400 italic text-center">
                    "I didn't start PiPilot to compete with other tools. I started it because I needed something
                    they couldn't give me. And if I needed it, I knew others did too."
                  </p>
                  <p className="text-purple-400 text-center mt-2 font-medium">— Hans Ade, Founder</p>
                </div>
              </div>
            </div>
          </div>

          {/* Founder Section */}
          <div className="max-w-6xl mx-auto mb-20">
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-pink-500/20 text-pink-300 border-pink-500/30">
                Meet the Founder
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-white">
                The Mind Behind PiPilot
              </h2>
            </div>

            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 md:p-12 border border-gray-700">
              <div className="grid md:grid-cols-3 gap-8 items-start">
                {/* Profile Image & Basic Info */}
                <div className="text-center">
                  <div className="relative w-48 h-48 mx-auto mb-6">
                    <Image
                      src="https://www.pixelways.co/team/hans.png"
                      alt="Hans Ade - Founder of PiPilot"
                      fill
                      className="rounded-full object-cover border-4 border-purple-500/50"
                    />
                    <div className="absolute -bottom-2 -right-2 bg-purple-500 rounded-full p-2">
                      <Award className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-1">Hans Ade</h3>
                  <p className="text-purple-400 font-medium mb-2">Anye Happiness Ade</p>
                  <p className="text-gray-400 mb-4">Founder & CEO, PiPilot</p>

                  <div className="flex flex-col gap-2">
                    <Badge variant="outline" className="text-blue-300 border-blue-500/50 justify-center">
                      Software Engineer
                    </Badge>
                    <Badge variant="outline" className="text-pink-300 border-pink-500/50 justify-center">
                      AI Developer
                    </Badge>
                  </div>
                </div>

                {/* Bio & Qualifications */}
                <div className="md:col-span-2 space-y-6">
                  <div>
                    <p className="text-gray-300 leading-relaxed mb-4">
                      Anye Happiness Ade, professionally known as <strong className="text-white">Hans Ade</strong>,
                      is a highly skilled Software Engineer & AI Developer with a passion for creating innovative
                      digital solutions that transform complex ideas into impactful, user-friendly applications.
                    </p>
                    <p className="text-gray-300 leading-relaxed">
                      Known for exceptional problem-solving abilities and a results-driven mindset, Hans combines
                      technical acumen with creativity to deliver scalable, high-performance applications that
                      leverage advanced AI techniques and cutting-edge research in machine learning and computer vision.
                    </p>
                  </div>

                  {/* Education */}
                  <div className="bg-gray-900/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <GraduationCap className="h-5 w-5 text-purple-400" />
                      <h4 className="text-white font-semibold">Education</h4>
                    </div>
                    <ul className="space-y-3 text-gray-300 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-purple-400 mt-1">•</span>
                        <span><strong className="text-white">Master's in Science and Engineering</strong> - Stanford University Online (2023-present) - Focus on Machine Learning, NLP & Computer Vision</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-purple-400 mt-1">•</span>
                        <div>
                          <span><strong className="text-white">Bachelor's in Software Engineering</strong> - SwissLink Higher Institute of Business and Technology & Atlantic International University</span>
                          <Link
                            href="https://www.aiu.edu/degree-verification/?ID=UB82014SY91231"
                            target="_blank"
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Verify AIU Degree
                          </Link>
                        </div>
                      </li>
                    </ul>
                  </div>

                  {/* Other Ventures */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-gray-400 text-sm">Also Co-Founder of:</span>
                    <Link
                      href="https://pixelways.co"
                      target="_blank"
                      className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <Globe className="h-4 w-4" />
                      Pixelways Solutions Inc, Ontario
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Expertise Section */}
          <div className="max-w-6xl mx-auto mb-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-4">Our Collective Expertise</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                Our team's professional qualifications encompass a broad range of abilities essential
                for success in the digital landscape.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <Card className="bg-gray-800/50 border-gray-700 hover:border-purple-500/50 transition-colors">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                    <Code className="h-6 w-6 text-purple-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Software Engineering & AI</h3>
                  <p className="text-gray-400 text-sm">
                    Expertise in designing, developing, and deploying innovative digital solutions with
                    strong proficiency in full-stack development and artificial intelligence integration.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gray-800/50 border-gray-700 hover:border-pink-500/50 transition-colors">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center mb-4">
                    <Lightbulb className="h-6 w-6 text-pink-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Problem-Solving Excellence</h3>
                  <p className="text-gray-400 text-sm">
                    Known for exceptional problem-solving abilities and a results-driven mindset,
                    combining technical acumen with creativity to deliver scalable solutions.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gray-800/50 border-gray-700 hover:border-blue-500/50 transition-colors">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                    <Sparkles className="h-6 w-6 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Emerging Technologies</h3>
                  <p className="text-gray-400 text-sm">
                    Passion for emerging technologies and continuous learning, consistently transforming
                    complex ideas into impactful, user-friendly solutions.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recognition Section */}
          <div className="max-w-4xl mx-auto mb-20">
            <Card className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 border-purple-500/30">
              <CardContent className="p-8 text-center">
                <Award className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-4">Recognized for Excellence</h2>
                <p className="text-gray-300 max-w-2xl mx-auto">
                  Our commitment to excellence, innovation, and client success has earned us recognition
                  in the industry. These accolades reflect the quality of our work and the dedication
                  of our team in delivering cutting-edge digital solutions that drive tangible results.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Contact Section */}
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-white mb-4">Get in Touch</h2>
              <p className="text-gray-400">We'd love to hear from you</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                      <Mail className="h-6 w-6 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">General Inquiries</h3>
                      <a
                        href="mailto:hello@pipilot.dev"
                        className="text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        hello@pipilot.dev
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center">
                      <Mail className="h-6 w-6 text-pink-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">Personal Enquiries (Hans)</h3>
                      <a
                        href="mailto:hanscadx8@gmail.com"
                        className="text-pink-400 hover:text-pink-300 transition-colors"
                      >
                        hanscadx8@gmail.com
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="text-center mt-8">
              <Button asChild className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                <Link href="/pricing">
                  Get Started with PiPilot
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}
