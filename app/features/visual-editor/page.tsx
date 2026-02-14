"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import {
  MousePointer2,
  Palette,
  Type,
  Move,
  Sparkles,
  Eye,
  Save,
  Undo2,
  Redo2,
  Layout,
  Trash2,
  ArrowRight,
  CheckCircle,
  Play,
  Zap,
  Monitor,
  Smartphone,
  Tablet,
  Code,
  Layers,
  PaintBucket,
  Settings,
  MessageSquare,
  ChevronRight,
  Star,
  Target,
  Lightbulb,
  Rocket
} from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

const features = [
  {
    icon: <MousePointer2 className="w-6 h-6" />,
    title: "Click-to-Select Elements",
    description: "Simply click any element in your app preview to select it. Visual overlays show exactly what you're editing."
  },
  {
    icon: <Palette className="w-6 h-6" />,
    title: "Real-time Style Changes",
    description: "Change colors, backgrounds, borders, and more. See changes instantly in the live preview."
  },
  {
    icon: <Type className="w-6 h-6" />,
    title: "100+ Google Fonts",
    description: "Access a huge library of fonts including Sans-serif, Serif, Monospace, Handwritten, Display, and Futuristic styles."
  },
  {
    icon: <Layout className="w-6 h-6" />,
    title: "Layout Controls",
    description: "Adjust flex direction, alignment, justify content, and wrap properties with intuitive controls."
  },
  {
    icon: <Move className="w-6 h-6" />,
    title: "Spacing & Sizing",
    description: "Fine-tune padding, margin, width, and height using Tailwind-compatible values."
  },
  {
    icon: <Sparkles className="w-6 h-6" />,
    title: "Instant Theme Switching",
    description: "Apply beautiful pre-built themes with one click. CSS variables update instantly across your entire app."
  }
]

const howItWorks = [
  {
    step: 1,
    title: "Enable Visual Editor",
    description: "Click the 'Visual Editor' toggle in your workspace to activate the editing mode.",
    icon: <Eye className="w-8 h-8 text-violet-500" />
  },
  {
    step: 2,
    title: "Select an Element",
    description: "Click any element in your app preview. A selection overlay appears showing what you've selected.",
    icon: <MousePointer2 className="w-8 h-8 text-violet-500" />
  },
  {
    step: 3,
    title: "Edit Properties",
    description: "Use the sidebar panels to modify styles, layout, spacing, typography, and more.",
    icon: <Settings className="w-8 h-8 text-violet-500" />
  },
  {
    step: 4,
    title: "Preview in Real-time",
    description: "Watch your changes appear instantly in the live preview as you adjust properties.",
    icon: <Monitor className="w-8 h-8 text-violet-500" />
  },
  {
    step: 5,
    title: "Save Changes",
    description: "Click 'Apply Changes' to save your edits directly to the source code files.",
    icon: <Save className="w-8 h-8 text-violet-500" />
  }
]

const fontCategories = [
  { name: "Sans-serif", count: 22, examples: "Inter, Poppins, Roboto, Montserrat, Open Sans" },
  { name: "Serif", count: 22, examples: "Playfair Display, Merriweather, Lora, Crimson Text" },
  { name: "Monospace", count: 8, examples: "JetBrains Mono, Fira Code, Source Code Pro" },
  { name: "Handwritten", count: 17, examples: "Pacifico, Dancing Script, Caveat, Great Vibes" },
  { name: "Display", count: 15, examples: "Bebas Neue, Oswald, Anton, Lobster" },
  { name: "Futuristic", count: 10, examples: "Orbitron, Exo 2, Audiowide, Oxanium" }
]

const styleProperties = [
  { category: "Colors", properties: ["Background Color", "Text Color", "Border Color", "Opacity"] },
  { category: "Typography", properties: ["Font Family", "Font Size", "Font Weight", "Line Height", "Letter Spacing", "Text Alignment"] },
  { category: "Layout", properties: ["Display", "Flex Direction", "Justify Content", "Align Items", "Gap", "Flex Wrap"] },
  { category: "Spacing", properties: ["Padding (all sides)", "Margin (all sides)", "Width", "Height", "Min/Max dimensions"] },
  { category: "Borders", properties: ["Border Width", "Border Style", "Border Radius", "Box Shadow"] }
]

const useCases = [
  {
    title: "Quick Style Fixes",
    description: "Need to adjust a color or font quickly? Click, change, done. No code diving required.",
    icon: <Zap className="w-6 h-6 text-yellow-500" />
  },
  {
    title: "Design Iteration",
    description: "Experiment with different styles and layouts in real-time. Perfect for A/B testing designs.",
    icon: <Target className="w-6 h-6 text-green-500" />
  },
  {
    title: "Client Presentations",
    description: "Make live adjustments during client meetings. Show different options instantly.",
    icon: <Monitor className="w-6 h-6 text-blue-500" />
  },
  {
    title: "Learning Tool",
    description: "See how styles affect elements. Great for learning CSS and Tailwind concepts.",
    icon: <Lightbulb className="w-6 h-6 text-orange-500" />
  }
]

export default function VisualEditorPage() {
  usePageTitle('Visual Editor')
  const [activeTab, setActiveTab] = useState("features")

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <Navigation />
      
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-4xl mx-auto"
          >
            <Badge className="mb-4 bg-violet-500/10 text-violet-600 border-violet-500/20">
              <Sparkles className="w-3 h-3 mr-1" />
              New Feature
            </Badge>
            
            <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Visual Editor
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Edit your apps visually with real-time preview. Click elements, change styles, colors, fonts, 
              and see changes instantly. No code writing required.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/workspace">
                <Button size="lg" className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 gap-2">
                  <Play className="w-4 h-4" />
                  Try Visual Editor Now
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="gap-2" onClick={() => setActiveTab("tutorial")}>
                <Eye className="w-4 h-4" />
                Watch Tutorial
              </Button>
            </div>
          </motion.div>

          {/* Preview Image/Video Placeholder */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-16 relative"
          >
            <div className="relative rounded-xl overflow-hidden border border-violet-500/20 shadow-2xl shadow-violet-500/10">
              <div className="aspect-video bg-gradient-to-br from-violet-950/50 to-purple-950/50">
                <iframe
                  src="https://drive.google.com/file/d/1itLVYWFtqnLfJaYLEgOArlYb3cWpC31V/preview"
                  width="100%"
                  height="100%"
                  allow="autoplay"
                  className="w-full h-full"
                  title="Visual Editor Demo Video"
                ></iframe>
              </div>
              
              {/* Floating UI Elements */}
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="absolute top-8 right-8 bg-card/80 backdrop-blur border rounded-lg p-3 shadow-lg"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Palette className="w-4 h-4 text-violet-500" />
                  <span>Styles Panel</span>
                </div>
              </motion.div>
              
              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 3, repeat: Infinity, delay: 0.5 }}
                className="absolute bottom-8 left-8 bg-card/80 backdrop-blur border rounded-lg p-3 shadow-lg"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Type className="w-4 h-4 text-violet-500" />
                  <span>Typography</span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Main Content Tabs */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-4 mb-12">
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="tutorial">How It Works</TabsTrigger>
              <TabsTrigger value="fonts">Fonts</TabsTrigger>
              <TabsTrigger value="properties">Properties</TabsTrigger>
            </TabsList>

            {/* Features Tab */}
            <TabsContent value="features">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {features.map((feature, index) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Card className="h-full hover:border-violet-500/50 transition-colors">
                      <CardHeader>
                        <div className="w-12 h-12 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-500 mb-4">
                          {feature.icon}
                        </div>
                        <CardTitle className="text-lg">{feature.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <CardDescription>{feature.description}</CardDescription>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {/* Use Cases */}
              <div className="mt-16">
                <h3 className="text-2xl font-bold text-center mb-8">Perfect For</h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {useCases.map((useCase, index) => (
                    <motion.div
                      key={useCase.title}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className="text-center p-6 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center mx-auto mb-4">
                        {useCase.icon}
                      </div>
                      <h4 className="font-semibold mb-2">{useCase.title}</h4>
                      <p className="text-sm text-muted-foreground">{useCase.description}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Tutorial Tab */}
            <TabsContent value="tutorial">
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                  <h3 className="text-2xl font-bold mb-4">How to Use Visual Editor</h3>
                  <p className="text-muted-foreground">Follow these simple steps to start editing your app visually</p>
                </div>

                <div className="space-y-8">
                  {howItWorks.map((step, index) => (
                    <motion.div
                      key={step.step}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className="flex gap-6 items-start"
                    >
                      <div className="flex-shrink-0">
                        <div className="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center relative">
                          {step.icon}
                          <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-violet-500 text-white text-xs flex items-center justify-center font-bold">
                            {step.step}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 pt-2">
                        <h4 className="text-lg font-semibold mb-2">{step.title}</h4>
                        <p className="text-muted-foreground">{step.description}</p>
                      </div>
                      {index < howItWorks.length - 1 && (
                        <ChevronRight className="w-5 h-5 text-muted-foreground self-center hidden lg:block" />
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Pro Tips */}
                <Card className="mt-12 border-violet-500/20 bg-violet-500/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-yellow-500" />
                      Pro Tips
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span><strong>Multi-select:</strong> Hold Ctrl/Cmd and click to select multiple elements</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span><strong>Undo/Redo:</strong> Use the toolbar buttons or Ctrl+Z/Ctrl+Y to undo changes</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span><strong>Tag to Chat:</strong> Click "Tag to Chat" to reference an element in AI conversation</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span><strong>Preview fonts:</strong> Font changes preview instantly before saving</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Fonts Tab */}
            <TabsContent value="fonts">
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                  <h3 className="text-2xl font-bold mb-4">100+ Google Fonts Available</h3>
                  <p className="text-muted-foreground">Choose from a curated collection of beautiful fonts for any style</p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {fontCategories.map((category, index) => (
                    <motion.div
                      key={category.name}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                    >
                      <Card className="h-full">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{category.name}</CardTitle>
                            <Badge variant="secondary">{category.count} fonts</Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">{category.examples}</p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                <Card className="mt-12">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-yellow-500" />
                      Font Features
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>Instant preview - see fonts applied in real-time</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>Multiple weights supported (300-700)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>Dynamic loading - fonts load only when selected</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>System fonts fallback for instant rendering</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>Pre-loaded in templates for production builds</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>Organized by category for easy browsing</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Properties Tab */}
            <TabsContent value="properties">
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                  <h3 className="text-2xl font-bold mb-4">Editable Style Properties</h3>
                  <p className="text-muted-foreground">Comprehensive control over every aspect of your elements</p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {styleProperties.map((group, index) => (
                    <motion.div
                      key={group.category}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                    >
                      <Card className="h-full">
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            {group.category === "Colors" && <Palette className="w-4 h-4 text-violet-500" />}
                            {group.category === "Typography" && <Type className="w-4 h-4 text-violet-500" />}
                            {group.category === "Layout" && <Layout className="w-4 h-4 text-violet-500" />}
                            {group.category === "Spacing" && <Move className="w-4 h-4 text-violet-500" />}
                            {group.category === "Borders" && <Layers className="w-4 h-4 text-violet-500" />}
                            {group.category}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {group.properties.map((prop) => (
                              <li key={prop} className="flex items-center gap-2 text-sm">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                {prop}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                <Card className="mt-12 border-violet-500/20 bg-violet-500/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Code className="w-5 h-5 text-violet-500" />
                      Tailwind CSS Integration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">
                      Visual Editor uses Tailwind CSS under the hood. Changes are converted to Tailwind classes 
                      automatically, ensuring your code stays clean and maintainable.
                    </p>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>Automatic Tailwind class generation</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>CSS variable support for theming</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>Responsive design ready</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>Dark mode compatible</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-violet-600/10 via-purple-600/10 to-pink-600/10">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Edit Visually?
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Start using the Visual Editor today and experience a new way to build beautiful apps.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/workspace">
                <Button size="lg" className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 gap-2">
                  <Rocket className="w-4 h-4" />
                  Open Workspace
                </Button>
              </Link>
              <Link href="/features/integrations">
                <Button size="lg" variant="outline" className="gap-2">
                  <Settings className="w-4 h-4" />
                  View Integrations
                </Button>
              </Link>
              <Link href="/docs">
                <Button size="lg" variant="outline" className="gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Read Documentation
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
