"use client"

import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Rocket, ExternalLink, Star, Eye, Heart, Calendar } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { usePageTitle } from '@/hooks/use-page-title'

export default function LaunchedPage() {
  usePageTitle('Launched Apps')
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
          <div className="text-center mb-16">
            <div className="flex items-center justify-center mb-4">
              <div className="w-6 h-6 rounded-full heart-gradient flex items-center justify-center">
                <Rocket className="w-3 h-3 text-white" />
              </div>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Launched Projects
            </h1>
            <p className="text-xl text-white/80 max-w-3xl mx-auto">
              Discover amazing apps and websites built by the PiPilot community.
            </p>
          </div>

          {/* Featured Projects */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-white mb-8">Featured Projects</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  title: "TaskFlow Pro",
                  description: "A beautiful task management app with AI-powered insights",
                  author: "Sarah Chen",
                  category: "Productivity",
                  likes: 234,
                  views: "12.5k",
                  image: "bg-gradient-to-br from-blue-500 to-purple-600",
                  featured: true
                },
                {
                  title: "EcoTracker",
                  description: "Environmental impact tracking for sustainable living",
                  author: "Mike Johnson",
                  category: "Lifestyle",
                  likes: 189,
                  views: "8.2k",
                  image: "bg-gradient-to-br from-green-500 to-teal-600",
                  featured: true
                },
                {
                  title: "DevConnect",
                  description: "Developer networking platform with real-time collaboration",
                  author: "Alex Rodriguez",
                  category: "Social",
                  likes: 456,
                  views: "25.1k",
                  image: "bg-gradient-to-br from-purple-500 to-pink-600",
                  featured: true
                }
              ].map((project, index) => (
                <Card key={index} className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:bg-gray-700/50 transition-colors">
                  <div className={`h-48 ${project.image} rounded-t-lg relative`}>
                    {project.featured && (
                      <Badge className="absolute top-4 left-4 bg-yellow-500 text-black">
                        Featured
                      </Badge>
                    )}
                    <div className="absolute bottom-4 right-4">
                      <Button size="sm" variant="secondary" className="bg-white/20 text-white hover:bg-white/30">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-white font-semibold text-lg mb-1">{project.title}</h3>
                        <p className="text-gray-300 text-sm mb-2">{project.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-4">
                      <Badge variant="secondary" className="bg-gray-700 text-gray-300">
                        {project.category}
                      </Badge>
                      <span className="text-gray-400 text-sm">by {project.author}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4 text-sm text-gray-400">
                        <div className="flex items-center space-x-1">
                          <Heart className="w-4 h-4" />
                          <span>{project.likes}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Eye className="w-4 h-4" />
                          <span>{project.views}</span>
                        </div>
                      </div>
                      <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                        View Project
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Recent Launches */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-white mb-8">Recent Launches</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  title: "BudgetBuddy",
                  category: "Finance",
                  author: "Emma Wilson",
                  date: "2 days ago"
                },
                {
                  title: "FitnessTracker",
                  category: "Health",
                  author: "David Kim",
                  date: "3 days ago"
                },
                {
                  title: "RecipeHub",
                  category: "Food",
                  author: "Lisa Park",
                  date: "5 days ago"
                },
                {
                  title: "StudyPlanner",
                  category: "Education",
                  author: "Tom Brown",
                  date: "1 week ago"
                }
              ].map((project, index) => (
                <Card key={index} className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:bg-gray-700/50 transition-colors">
                  <CardContent className="p-4">
                    <h3 className="text-white font-semibold mb-2">{project.title}</h3>
                    <div className="flex items-center justify-between text-sm">
                      <Badge variant="secondary" className="bg-gray-700 text-gray-300 text-xs">
                        {project.category}
                      </Badge>
                      <span className="text-gray-400">{project.date}</span>
                    </div>
                    <p className="text-gray-400 text-sm mt-2">by {project.author}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-white mb-8">Browse by Category</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {[
                "All Projects",
                "Productivity",
                "Social",
                "E-commerce",
                "Education",
                "Entertainment",
                "Finance",
                "Health",
                "Lifestyle",
                "Technology",
                "Travel",
                "Utilities"
              ].map((category, index) => (
                <Button
                  key={index}
                  variant={index === 0 ? "default" : "outline"}
                  className={index === 0 ? "bg-purple-600 hover:bg-purple-700" : "border-gray-600 text-white hover:bg-gray-700"}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="bg-gray-800/50 rounded-xl p-8 backdrop-blur-sm text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Ready to Launch?</h2>
            <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
              Build your next amazing project with PiPilot and join our community of creators.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white">
                Start Building
              </Button>
              <Button size="lg" variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
                Submit Your Project
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 bg-gray-900/50 backdrop-blur-sm border-t border-gray-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            <div className="md:col-span-1">
              <Logo variant="text" size="md" className="mb-4" />
              <p className="text-gray-400 text-sm">
                Build something amazing with AI-powered development.
              </p>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Press & media</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Enterprise</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Security</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Trust center</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Student discount</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Solutions</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Integrations</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Changelog</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Resources</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Learn</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">How-to guides</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Videos</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Support</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Community</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Discord</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Reddit</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">X/Twitter</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">LinkedIn</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-4 mb-4 md:mb-0">
              <Logo variant="icon" size="sm" />
              <span className="text-gray-400 text-sm">EN</span>
            </div>
            <div className="text-gray-400 text-sm">
              © 2025 PiPilot. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
