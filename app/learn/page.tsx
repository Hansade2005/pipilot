"use client"
import Link from "next/link"
import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  BookOpen, Video, Play, Users, Clock, Star, ArrowRight, MessageSquare, Code, Rocket, Layers, Settings,
  Search, Filter, CheckCircle, TrendingUp, Award, Target, Lightbulb, Zap, BarChart3, X, GraduationCap,
  PlayCircle, FileText, Trophy, Calendar, User, Check, Lock, Unlock, Download, Share2,
  ChevronDown, ChevronRight, Book, Brain, Code2, Palette, Database, Globe, Smartphone, Award as CertificateIcon,
  MessageCircle, UserCheck
} from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { useEffect, useState } from "react"
import { usePageTitle } from '@/hooks/use-page-title'

interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  content: {
    introduction: string
    main_content: Array<{
      heading: string
      body: string
      key_points?: string[]
      technical_highlights?: string[]
      market_trends?: string[]
      benefits?: string[]
      features?: string[]
      challenges?: string[]
      solutions?: string[]
    }>
    conclusion: string
    project_overview?: any
    development_journey?: any
    results_and_metrics?: any
    lessons_learned?: any
    case_studies?: any
    advanced_usage?: any
    real_world_examples?: any
  }
  author: string
  published_date: string
  last_modified: string
  category: string
  tags: string[]
  featured_image: string
  reading_time: string
  seo_meta: {
    title: string
    description: string
    keywords: string[]
  }
  related_posts: string[]
  status: string
}

interface HelpResource {
  id: string
  title: string
  description: string
  tags: string[]
  estimated_read_time: string
}

interface Lesson {
  id: string
  title: string
  description: string
  duration: string
  type: "video" | "text" | "interactive" | "quiz"
  content?: string
  videoUrl?: string
  completed: boolean
}

interface Module {
  id: string
  title: string
  description: string
  lessons: Lesson[]
  duration: string
  completed: boolean
  unlocked: boolean
}

interface Course {
  id: string
  title: string
  description: string
  longDescription: string
  instructor: string
  avatar: string
  duration: string
  level: string
  category: string
  rating: number
  students: number
  price: string
  modules: Module[]
  skills: string[]
  prerequisites: string[]
  featured: boolean
  enrolled: boolean
  progress: number
  completed: boolean
  certificateAvailable: boolean
  content?: {
    modules: any[]
    [key: string]: any
  }
}

interface UserProfile {
  firstName: string
  lastName: string
  email: string
  phone?: string
  country: string
  organization?: string
  jobTitle?: string
  enrollmentDate: string
  profileImage?: string
}

interface UserProgress {
  userId: string
  userProfile?: UserProfile
  enrolledCourses: string[]
  completedCourses: string[]
  courseProgress: { [courseId: string]: { [moduleId: string]: { [lessonId: string]: boolean } } }
  certificates: string[]
  totalTimeSpent: number
  lastActive: string
}

export default function LearnPage() {
  usePageTitle('Learn')
  const [courses, setCourses] = useState<Course[]>([])
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([])
  const [coursesData, setCoursesData] = useState<any>(null)
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedLevel, setSelectedLevel] = useState<string>("all")
  const [selectedTab, setSelectedTab] = useState<"courses" | "progress" | "certificates">("courses")
  const [showCertificate, setShowCertificate] = useState(false)
  const [selectedCertificate, setSelectedCertificate] = useState<Course | null>(null)
  const [showEnrollmentForm, setShowEnrollmentForm] = useState(false)
  const [selectedCourseForEnrollment, setSelectedCourseForEnrollment] = useState<Course | null>(null)
  const [enrollmentFormData, setEnrollmentFormData] = useState<UserProfile>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    country: '',
    organization: '',
    jobTitle: '',
    enrollmentDate: '',
    profileImage: ''
  })

  const categories = [
    { id: "all", name: "All Courses", icon: BookOpen },
    { id: "ai-development", name: "AI Development", icon: Brain },
    { id: "web-development", name: "Web Development", icon: Code2 },
    { id: "design", name: "Design", icon: Palette },
    { id: "database", name: "Database", icon: Database },
    { id: "mobile", name: "Mobile Development", icon: Smartphone }
  ]

  const levels = ["All Levels", "Beginner", "Intermediate", "Advanced"]

  // Image API utility function
  const getCourseThumbnail = (courseTitle: string, seed: number) => {
    const description = `${courseTitle} course thumbnail, professional educational content`
    return `https://api.a0.dev/assets/image?text=${encodeURIComponent(description)}&aspect=1:1&seed=${seed}`
  }

  // Load courses and user progress
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load courses from JSON
        const coursesResponse = await fetch('/courses.json')
        const coursesData = await coursesResponse.json()

        // Load user progress
        const progress = localStorage.getItem('pixelPilotUserProgress')
        if (progress) {
          setUserProgress(JSON.parse(progress))
        } else {
          const defaultProgress: UserProgress = {
            userId: 'user_' + Date.now(),
            enrolledCourses: [],
            completedCourses: [],
            courseProgress: {},
            certificates: [],
            totalTimeSpent: 0,
            lastActive: new Date().toISOString()
          }
          setUserProgress(defaultProgress)
          localStorage.setItem('pixelPilotUserProgress', JSON.stringify(defaultProgress))
        }

        setCourses(coursesData.courses)
        setFilteredCourses(coursesData.courses)
        setCoursesData(coursesData)
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // Handle enrollment from URL parameter
  useEffect(() => {
    if (!loading && courses.length > 0) {
      const urlParams = new URLSearchParams(window.location.search)
      const enrollCourseId = urlParams.get('enroll')
      if (enrollCourseId) {
        const courseToEnroll = courses.find(c => c.id === enrollCourseId)
        if (courseToEnroll && !courseToEnroll.enrolled) {
          handleEnrollClick(courseToEnroll)
          // Clean up URL
          window.history.replaceState({}, '', '/learn')
        }
      }
    }
  }, [loading, courses])

  // Save progress to localStorage whenever it changes
  useEffect(() => {
    if (userProgress) {
      localStorage.setItem('pixelPilotUserProgress', JSON.stringify(userProgress))
    }
  }, [userProgress])

  // Live search and filtering
  useEffect(() => {
    let filtered = courses

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(course =>
        course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.skills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase())) ||
        course.instructor.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Category filter
    if (selectedCategory !== "all") {
      filtered = filtered.filter(course => course.category.toLowerCase().replace(/\s+/g, '-') === selectedCategory)
    }

    // Level filter
    if (selectedLevel !== "all") {
      filtered = filtered.filter(course => course.level === selectedLevel)
    }

    setFilteredCourses(filtered)
  }, [searchQuery, selectedCategory, selectedLevel, courses])

  const handleEnrollClick = (course: Course) => {
    // Check if user already has a profile
    if (userProgress?.userProfile) {
      // User already has profile, enroll directly
      enrollInCourse(course.id)
    } else {
      // Show enrollment form first
      setSelectedCourseForEnrollment(course)
      setShowEnrollmentForm(true)
    }
  }

  const handleEnrollmentSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedCourseForEnrollment || !userProgress) return

    // Create or update user profile
    const updatedProgress = {
      ...userProgress,
      userProfile: {
        ...enrollmentFormData,
        enrollmentDate: new Date().toISOString()
      },
      enrolledCourses: [...userProgress.enrolledCourses, selectedCourseForEnrollment.id],
      courseProgress: {
        ...userProgress.courseProgress,
        [selectedCourseForEnrollment.id]: {}
      },
      lastActive: new Date().toISOString()
    }

    setUserProgress(updatedProgress)
    localStorage.setItem('pixelPilotUserProgress', JSON.stringify(updatedProgress))

    // Update course enrollment status
    setCourses(prev => prev.map(course =>
      course.id === selectedCourseForEnrollment.id ? { ...course, enrolled: true } : course
    ))

    // Close form and reset
    setShowEnrollmentForm(false)
    setSelectedCourseForEnrollment(null)
    setEnrollmentFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      country: '',
      organization: '',
      jobTitle: '',
      enrollmentDate: '',
      profileImage: ''
    })
  }

  const enrollInCourse = (courseId: string) => {
    if (!userProgress) return

    const updatedProgress = {
      ...userProgress,
      enrolledCourses: [...userProgress.enrolledCourses, courseId],
      courseProgress: {
        ...userProgress.courseProgress,
        [courseId]: {}
      },
      lastActive: new Date().toISOString()
    }
    setUserProgress(updatedProgress)

    // Update course enrollment status
    setCourses(prev => prev.map(course =>
      course.id === courseId ? { ...course, enrolled: true } : course
    ))
  }

  const completeLesson = (courseId: string, moduleId: string, lessonId: string) => {
    if (!userProgress) return

    const updatedProgress = {
      ...userProgress,
      courseProgress: {
        ...userProgress.courseProgress,
        [courseId]: {
          ...userProgress.courseProgress[courseId],
          [moduleId]: {
            ...userProgress.courseProgress[courseId]?.[moduleId],
            [lessonId]: true
          }
        }
      },
      lastActive: new Date().toISOString()
    }

    // Check if course is completed
    const course = courses.find(c => c.id === courseId)
    if (course) {
      const totalLessons = course.content?.modules?.reduce((total, module) =>
        total + module.lessons.length, 0) || 0

      const completedLessons = Object.values(updatedProgress.courseProgress[courseId] || {})
        .reduce((total, module: any) => total + Object.values(module).filter(Boolean).length, 0)

      if (completedLessons === totalLessons && !updatedProgress.completedCourses.includes(courseId)) {
        updatedProgress.completedCourses = [...updatedProgress.completedCourses, courseId]
        updatedProgress.certificates = [...updatedProgress.certificates, courseId]
      }
    }

    setUserProgress(updatedProgress)
  }

  const completeCourse = (courseId: string) => {
    if (!userProgress) return

    const updatedProgress = {
      ...userProgress,
      completedCourses: [...userProgress.completedCourses, courseId],
      certificates: [...userProgress.certificates, courseId],
      lastActive: new Date().toISOString()
    }
    setUserProgress(updatedProgress)

    // Update course completion status
    setCourses(prev => prev.map(course =>
      course.id === courseId ? { ...course, completed: true, certificateAvailable: true } : course
    ))
  }

  const generateCertificate = (course: Course) => {
    setSelectedCertificate(course)
    setShowCertificate(true)
  }

  const clearFilters = () => {
    setSearchQuery("")
    setSelectedCategory("all")
    setSelectedLevel("all")
  }

  const getDifficultyColor = (level: string) => {
    switch (level.toLowerCase()) {
      case "beginner": return "bg-green-600"
      case "intermediate": return "bg-yellow-600"
      case "advanced": return "bg-red-600"
      case "all levels": return "bg-purple-600"
      default: return "bg-gray-600"
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <Navigation />
        <div className="relative z-10 pt-16 pb-24 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white">Loading learning platform...</p>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

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
          {/* Enhanced Hero Section */}
          <div className="text-center mb-20">
            <div className="flex items-center justify-center mb-6">
              <div className="w-8 h-8 rounded-full heart-gradient flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              PiPilot
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                Learning Hub
              </span>
            </h1>
            <p className="text-xl text-white/80 max-w-4xl mx-auto mb-8 leading-relaxed">
              Master AI-powered development with comprehensive courses, interactive tutorials,
              and hands-on projects. Track your progress and earn professional certificates.
            </p>

            {/* Key Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12 max-w-4xl mx-auto">
              <div className="text-center">
                <div className="text-3xl font-bold text-white mb-2">{filteredCourses.length}+</div>
                <div className="text-gray-400">Available Courses</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white mb-2">
                  {userProgress?.enrolledCourses.length || 0}
                </div>
                <div className="text-gray-400">Courses Enrolled</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white mb-2">
                  {userProgress?.completedCourses.length || 0}
                </div>
                <div className="text-gray-400">Courses Completed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white mb-2">
                  {userProgress?.certificates.length || 0}
                </div>
                <div className="text-gray-400">Certificates Earned</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 text-lg">
                <PlayCircle className="w-5 h-5 mr-2" />
                Start Learning Now
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-gray-600 text-white hover:bg-gray-700 px-8 py-4 text-lg"
                onClick={() => setSelectedTab("progress")}
              >
                <Trophy className="w-5 h-5 mr-2" />
                View My Progress
              </Button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="mb-12">
            <div className="flex justify-center">
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-2 border border-gray-700/50">
                <div className="flex space-x-2">
                  {[
                    { id: "courses", label: "Courses", icon: BookOpen },
                    { id: "progress", label: "My Progress", icon: Target },
                    { id: "certificates", label: "Certificates", icon: CertificateIcon }
                  ].map((tab) => {
                    const IconComponent = tab.icon
                    return (
                      <Button
                        key={tab.id}
                        variant={selectedTab === tab.id ? "default" : "ghost"}
                        onClick={() => setSelectedTab(tab.id as any)}
                        className={`flex items-center space-x-2 px-6 py-3 ${
                          selectedTab === tab.id
                            ? "bg-purple-600 hover:bg-purple-700"
                            : "text-gray-300 hover:text-white hover:bg-gray-700/50"
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                        <span>{tab.label}</span>
                      </Button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Courses Tab */}
          {selectedTab === "courses" && (
            <>
              {/* Search and Filter Section */}
              <div className="mb-16">
                <div className="max-w-4xl mx-auto">
                  {/* Search Bar */}
                  <div className="relative mb-6">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="Search courses, skills, or instructors..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-12 pr-4 py-4 text-lg bg-gray-800/50 border-gray-700/50 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500 rounded-xl"
                      />
                      {(searchQuery || selectedCategory !== "all" || selectedLevel !== "all") && (
                        <Button
                          onClick={clearFilters}
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="flex flex-wrap gap-4 items-center justify-center">
                    {/* Category Filter */}
                    <div className="flex items-center space-x-2">
                      <Filter className="w-4 h-4 text-gray-400" />
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:ring-purple-500"
                      >
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Level Filter */}
                  <div className="flex items-center space-x-2">
                      <span className="text-gray-400 text-sm">Level:</span>
                      <select
                        value={selectedLevel}
                        onChange={(e) => setSelectedLevel(e.target.value)}
                        className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:ring-purple-500"
                      >
                        {levels.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Active Filters Display */}
                  {(searchQuery || selectedCategory !== "all" || selectedLevel !== "all") && (
                    <div className="mt-4 flex flex-wrap gap-2 justify-center">
                      {searchQuery && (
                        <Badge variant="secondary" className="bg-purple-600 text-white">
                          Search: "{searchQuery}"
                        </Badge>
                      )}
                      {selectedCategory !== "all" && (
                        <Badge variant="secondary" className="bg-blue-600 text-white">
                          Category: {categories.find(c => c.id === selectedCategory)?.name}
                        </Badge>
                      )}
                      {selectedLevel !== "all" && (
                        <Badge variant="secondary" className="bg-green-600 text-white">
                          Level: {selectedLevel}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                </div>

              {/* Featured Course */}
              {filteredCourses.find(course => course.featured) && (
                <div className="mb-16">
                  <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white mb-4">Featured Course</h2>
                    <Badge className="bg-yellow-600 text-white px-4 py-2">
                      <Star className="w-4 h-4 mr-2" />
                      Recommended for New Learners
                    </Badge>
                  </div>

                  {(() => {
                    const featuredCourse = filteredCourses.find(course => course.featured)
                    if (!featuredCourse) return null

                    return (
                      <Link href={`/learn/${featuredCourse.id}`}>
                        <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20 backdrop-blur-sm hover:bg-purple-500/20 transition-colors cursor-pointer">
                          <CardContent className="p-8">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                              <div>
                                <Badge className="bg-purple-600 text-white mb-4">
                                  {featuredCourse.category}
                                </Badge>
                                <h3 className="text-3xl font-bold text-white mb-4">
                                  {featuredCourse.title}
                                </h3>
                                <p className="text-gray-300 text-lg mb-6">
                                  {featuredCourse.longDescription}
                                </p>

                                <div className="grid grid-cols-2 gap-4 mb-6">
                                  <div className="flex items-center space-x-2">
                                    <Clock className="w-5 h-5 text-gray-400" />
                                    <span className="text-gray-300">{featuredCourse.duration}</span>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Users className="w-5 h-5 text-gray-400" />
                                    <span className="text-gray-300">{featuredCourse.students.toLocaleString()} students</span>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Star className="w-5 h-5 text-yellow-400 fill-current" />
                                    <span className="text-gray-300">{featuredCourse.rating} rating</span>
                                  </div>
                                  <Badge className={getDifficultyColor(featuredCourse.level)}>
                                    {featuredCourse.level}
                                  </Badge>
                                </div>

                                <div className="flex flex-wrap gap-2 mb-6">
                                  {featuredCourse.skills.slice(0, 4).map((skill, index) => (
                                    <Badge key={index} variant="outline" className="border-gray-600 text-gray-400">
                                      {skill}
                                    </Badge>
                                  ))}
                                </div>

                                <Button
                                  size="lg"
                                  className="bg-purple-600 hover:bg-purple-700 text-white px-8"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    enrollInCourse(featuredCourse.id)
                                  }}
                                >
                                  {featuredCourse.enrolled ? "Continue Learning" : "Start Course"}
                                  <ArrowRight className="w-5 h-5 ml-2" />
                                </Button>
                              </div>

                              <div className="relative">
                                <div className="w-full h-64 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl overflow-hidden">
                                  <img
                                    src={getCourseThumbnail(featuredCourse.title, featuredCourse.students)}
                                    alt={featuredCourse.title}
                                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                                    onError={(e) => {
                                      const target = e.currentTarget as HTMLElement
                                      target.style.display = 'none'
                                      const sibling = target.nextElementSibling as HTMLElement
                                      if (sibling) sibling.style.display = 'flex'
                                    }}
                                  />
                                  <div className="w-full h-full flex items-center justify-center" style={{ display: 'none' }}>
                                    <GraduationCap className="w-16 h-16 text-white" />
                                  </div>
                                </div>
                                {featuredCourse.enrolled && (
                                  <div className="absolute top-4 right-4">
                                    <div className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                                      Enrolled
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    )
                  })()}
                </div>
              )}

              {/* Course Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
                {filteredCourses.map((course, index) => {
                  const IconComponent = categories.find(c => c.id === course.category.toLowerCase().replace(/\s+/g, '-'))?.icon || BookOpen

                  return (
                    <Link key={course.id} href={`/learn/${course.id}`}>
                      <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:bg-gray-700/50 transition-colors group cursor-pointer">
                        {/* Course Thumbnail */}
                        <div className="aspect-video bg-gradient-to-br from-purple-500 to-pink-600 rounded-t-lg overflow-hidden">
                          <img
                            src={getCourseThumbnail(course.title, course.students)}
                            alt={course.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              const target = e.currentTarget as HTMLElement
                              target.style.display = 'none'
                              const sibling = target.nextElementSibling as HTMLElement
                              if (sibling) sibling.style.display = 'flex'
                            }}
                          />
                          <div className="w-full h-full flex items-center justify-center" style={{ display: 'none' }}>
                            <IconComponent className="w-12 h-12 text-white/80" />
                          </div>
                          {course.featured && (
                            <div className="absolute top-3 right-3">
                              <Badge className="bg-yellow-600 text-white">
                                <Star className="w-3 h-3 mr-1" />
                                Featured
                              </Badge>
                            </div>
                          )}
                        </div>

                        <CardHeader className="pb-4">
                          <div className="flex items-start justify-between mb-4">
                            <Badge className="bg-purple-600 text-white">
                              {course.category}
                            </Badge>
                            {course.enrolled && (
                              <Badge className="bg-green-600 text-white">
                                <Check className="w-3 h-3 mr-1" />
                                Enrolled
                              </Badge>
                            )}
                          </div>

                          <CardTitle className="text-white text-lg mb-2 group-hover:text-purple-400 transition-colors line-clamp-2">
                            {course.title}
                          </CardTitle>
                          <CardDescription className="text-gray-300 line-clamp-2">
                            {course.description}
                </CardDescription>
              </CardHeader>

              <CardContent>
                          <div className="space-y-4">
                            {/* Course Meta */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-300">{course.duration}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Users className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-300">{course.students.toLocaleString()}</span>
                              </div>
                            </div>

                            {/* Rating */}
                            <div className="flex items-center space-x-2">
                              <div className="flex items-center">
                                <Star className="w-4 h-4 text-yellow-400 fill-current" />
                                <span className="text-white ml-1">{course.rating}</span>
                              </div>
                              <Badge className={getDifficultyColor(course.level)}>
                                {course.level}
                              </Badge>
                            </div>

                            {/* Instructor */}
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full overflow-hidden">
                                <img src="/hans.png" alt={course.instructor} className="w-full h-full object-cover" />
                              </div>
                              <div className="text-xs text-gray-300">
                                <div>by {course.instructor}</div>
                                <div className="text-gray-500">Founder & CEO</div>
                              </div>
                            </div>

                            {/* Progress Bar (if enrolled) */}
                            {course.enrolled && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-gray-400">Progress</span>
                                  <span className="text-white">{course.progress}%</span>
                                </div>
                                <Progress value={course.progress} className="h-2" />
                              </div>
                            )}

                            {/* Skills */}
                            <div className="flex flex-wrap gap-1">
                              {course.skills.slice(0, 2).map((skill, skillIndex) => (
                                <Badge key={skillIndex} variant="outline" className="text-xs border-gray-600 text-gray-400">
                                  {skill}
                                </Badge>
                              ))}
                              {course.skills.length > 2 && (
                                <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                                  +{course.skills.length - 2} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
                  </div>

              {filteredCourses.length === 0 && (
                <div className="text-center py-16">
                  <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">No courses found</h3>
                  <p className="text-gray-400 mb-4">
                    Try adjusting your search terms or filters to find what you're looking for.
                  </p>
                  <Button onClick={clearFilters} variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
                    Clear Filters
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Progress Tab */}
          {selectedTab === "progress" && userProgress && (
            <div className="space-y-8">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">My Learning Progress</h2>
                <p className="text-gray-300">Track your journey and achievements</p>
              </div>

              {/* Progress Overview */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
                <Card className="bg-gray-800/50 border-gray-700/50">
                  <CardContent className="p-6 text-center">
                    <BookOpen className="w-8 h-8 text-purple-400 mx-auto mb-4" />
                    <div className="text-2xl font-bold text-white mb-2">{userProgress.enrolledCourses.length}</div>
                    <div className="text-gray-400">Enrolled Courses</div>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800/50 border-gray-700/50">
                  <CardContent className="p-6 text-center">
                    <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-4" />
                    <div className="text-2xl font-bold text-white mb-2">{userProgress.completedCourses.length}</div>
                    <div className="text-gray-400">Completed Courses</div>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800/50 border-gray-700/50">
                  <CardContent className="p-6 text-center">
                    <CertificateIcon className="w-8 h-8 text-blue-400 mx-auto mb-4" />
                    <div className="text-2xl font-bold text-white mb-2">{userProgress.certificates.length}</div>
                    <div className="text-gray-400">Certificates Earned</div>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800/50 border-gray-700/50">
                  <CardContent className="p-6 text-center">
                    <TrendingUp className="w-8 h-8 text-orange-400 mx-auto mb-4" />
                    <div className="text-2xl font-bold text-white mb-2">{Math.round(userProgress.totalTimeSpent / 60)}h</div>
                    <div className="text-gray-400">Time Spent Learning</div>
              </CardContent>
            </Card>
          </div>

              {/* Enrolled Courses Progress */}
              {userProgress.enrolledCourses.length > 0 && (
                <div>
                  <h3 className="text-2xl font-bold text-white mb-6">Current Learning</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {userProgress.enrolledCourses.map(courseId => {
                      const course = courses.find(c => c.id === courseId)
                      if (!course) return null

                      return (
                        <Card key={courseId} className="bg-gray-800/50 border-gray-700/50">
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle className="text-white text-lg">{course.title}</CardTitle>
                                <CardDescription className="text-gray-300">{course.instructor}</CardDescription>
                              </div>
                              <Badge className={getDifficultyColor(course.level)}>
                                {course.level}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              <div>
                                <div className="flex items-center justify-between text-sm mb-2">
                                  <span className="text-gray-400">Progress</span>
                                  <span className="text-white">{course.progress}%</span>
                                </div>
                                <Progress value={course.progress} className="h-2" />
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 text-sm">Next: Module 1, Lesson 2</span>
                                <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                                  Continue
                                </Button>
                  </div>
                    </div>
                  </CardContent>
                </Card>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Certificates Tab */}
          {selectedTab === "certificates" && userProgress && (
            <div className="space-y-8">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">My Certificates</h2>
                <p className="text-gray-300">Celebrate your learning achievements</p>
          </div>

              {userProgress.certificates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {userProgress.certificates.map(courseId => {
                    const course = courses.find(c => c.id === courseId)
                    if (!course) return null

                    return (
                      <Card key={courseId} className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:bg-gray-700/50 transition-colors cursor-pointer group">
                        <CardContent className="p-6 text-center">
                          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                            <CertificateIcon className="w-8 h-8 text-yellow-400" />
                          </div>
                          <h3 className="text-white font-semibold mb-2">{course.title}</h3>
                          <p className="text-gray-400 text-sm mb-4">Completed on {new Date().toLocaleDateString()}</p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                              onClick={() => generateCertificate(course)}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              View
                            </Button>
                            <Button size="sm" variant="outline" className="border-gray-600">
                              <Share2 className="w-4 h-4" />
                            </Button>
                    </div>
                  </CardContent>
                </Card>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-16">
                  <CertificateIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">No certificates yet</h3>
                  <p className="text-gray-400 mb-6">
                    Complete your first course to earn your professional certificate!
                  </p>
                  <Button
                    className="bg-purple-600 hover:bg-purple-700"
                    onClick={() => setSelectedTab("courses")}
                  >
                    Browse Courses
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Certificate Modal */}
      {showCertificate && selectedCertificate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Course Certificate</h2>
                <Button
                  variant="ghost"
                  onClick={() => setShowCertificate(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </Button>
              </div>

              {/* Professional Certificate Design */}
              <div className="bg-gradient-to-br from-slate-50 via-white to-purple-50 rounded-xl p-8 border-4 border-purple-300 shadow-2xl">
                <div className="text-center">
                  {/* Header with Logo */}
                  <div className="mb-8">
                    {/* Site Logo */}
                    <div className="flex justify-center mb-6">
                      <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center shadow-lg">
                        <Logo className="w-10 h-10 text-white" />
                      </div>
                    </div>

                    <div className="border-t-4 border-b-4 border-purple-400 py-4 mb-6">
                      <h1 className="text-4xl font-bold text-gray-900 mb-2 tracking-wider">CERTIFICATE</h1>
                      <h2 className="text-2xl font-semibold text-purple-700 mb-1">OF COMPLETION</h2>
                      <p className="text-lg text-gray-600 font-medium">PiPilot Learning Platform</p>
                    </div>
                  </div>

                  {/* Decorative Elements */}
                  <div className="flex justify-between items-center mb-8 px-8">
                    <div className="w-16 h-1 bg-gradient-to-r from-purple-400 to-pink-400 rounded"></div>
                    <CertificateIcon className="w-8 h-8 text-purple-600" />
                    <div className="w-16 h-1 bg-gradient-to-r from-pink-400 to-purple-400 rounded"></div>
                  </div>

                  {/* Recipient */}
                  <div className="mb-8">
                    <p className="text-gray-600 mb-4 font-medium">This certificate is proudly presented to</p>
                    <div className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text">
                      <h2 className="text-4xl font-bold text-transparent mb-2 tracking-wide">
                        {userProgress?.userProfile ?
                          `${userProgress.userProfile.firstName} ${userProgress.userProfile.lastName}` :
                          'Student Name'
                        }
                      </h2>
                    </div>
                    <p className="text-gray-600 text-lg">for successfully completing</p>
                  </div>

                  {/* Course */}
                  <div className="mb-8">
                    <div className="bg-white rounded-lg p-4 shadow-md border border-purple-200 mx-auto max-w-md">
                      <h3 className="text-2xl font-bold text-purple-700 mb-2 text-center">
                        {selectedCertificate.title}
                      </h3>
                      <div className="flex justify-center items-center space-x-4 text-sm text-gray-600">
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {selectedCertificate.duration}
                        </span>
                        <span className="flex items-center">
                          <Star className="w-4 h-4 mr-1 text-yellow-500" />
                          {selectedCertificate.rating}/5.0
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Achievement Details */}
                  <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                      <div className="text-2xl font-bold text-green-600 mb-1">100%</div>
                      <div className="text-sm text-gray-600">Course Completion</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                      <div className="text-2xl font-bold text-blue-600 mb-1">
                        {selectedCertificate.content && selectedCertificate.content.modules ? selectedCertificate.content.modules.length : 0}
                      </div>
                      <div className="text-sm text-gray-600">Modules Completed</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                      <div className="text-2xl font-bold text-purple-600 mb-1">A+</div>
                      <div className="text-sm text-gray-600">Grade Achieved</div>
                    </div>
                  </div>

                  {/* Signature Section */}
                  <div className="mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Student Signature */}
                      <div className="text-center">
                        <div className="border-t-2 border-gray-400 w-48 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600 mb-1">Student Signature</p>
                        <p className="text-base font-medium text-gray-900">
                          {userProgress?.userProfile ?
                            `${userProgress.userProfile.firstName} ${userProgress.userProfile.lastName}` :
                            'Student Name'
                          }
                        </p>
                      </div>

                      {/* Instructor Signature */}
                      <div className="text-center">
                        <div className="border-t-2 border-gray-400 w-48 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600 mb-1">Founder & CEO</p>
                        <p className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Dancing Script, cursive' }}>
                          Anye Happiness Ade
                        </p>
                        <p className="text-xs text-gray-500">PiPilot Learning Platform</p>
                      </div>
                    </div>
                  </div>

                  {/* Date and Verification */}
                  <div className="mb-8">
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 mx-auto max-w-md">
                      <div className="text-center">
                        <p className="text-gray-600 text-sm mb-1">Date of Completion</p>
                        <p className="text-lg font-bold text-gray-900">
                          {new Date().toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Certificate ID and Verification */}
                  <div className="border-t border-gray-300 pt-6">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Certificate ID</p>
                        <p className="text-sm font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">
                          PP-{selectedCertificate.id.toUpperCase()}-{Date.now()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500 mb-1">Verification</p>
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          <span className="text-sm font-medium">Verified</span>
                        </div>
                      </div>
                    </div>

                    {/* Footer Branding */}
                    <div className="text-center border-t border-gray-200 pt-4">
                      <p className="text-xs text-gray-500 mb-2">
                        This certificate was issued by PiPilot Learning Platform
                      </p>
                      <div className="flex justify-center items-center space-x-4">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                          <Logo className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">pixelpilot.dev</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          
              {/* Action Buttons */}
              <div className="flex gap-4 mt-6">
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white">
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
                <Button variant="outline" className="flex-1">
                  <Share2 className="w-4 h-4 mr-2" />
                  Share Certificate
                </Button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Enrollment Form Modal */}
      {showEnrollmentForm && selectedCourseForEnrollment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Enroll in Course</h2>
                  <p className="text-gray-600 mt-1">Complete your profile to get started with {selectedCourseForEnrollment.title}</p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setShowEnrollmentForm(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </Button>
              </div>

              <form onSubmit={handleEnrollmentSubmit} className="space-y-6">
                {/* Course Info */}
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{selectedCourseForEnrollment.title}</h3>
                      <p className="text-sm text-gray-600">by {selectedCourseForEnrollment.instructor}</p>
                    </div>
                  </div>
                </div>

                {/* Personal Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        First Name *
                      </label>
                      <Input
                        type="text"
                        required
                        value={enrollmentFormData.firstName}
                        onChange={(e) => setEnrollmentFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        placeholder="Enter your first name"
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Name *
                      </label>
                      <Input
                        type="text"
                        required
                        value={enrollmentFormData.lastName}
                        onChange={(e) => setEnrollmentFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        placeholder="Enter your last name"
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address *
                    </label>
                    <Input
                      type="email"
                      required
                      value={enrollmentFormData.email}
                      onChange={(e) => setEnrollmentFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="your.email@example.com"
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number
                    </label>
                    <Input
                      type="tel"
                      value={enrollmentFormData.phone}
                      onChange={(e) => setEnrollmentFormData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="+1 (555) 123-4567"
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Country *
                    </label>
                    <Select
                      value={enrollmentFormData.country}
                      onValueChange={(value) => setEnrollmentFormData(prev => ({ ...prev, country: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select your country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us">United States</SelectItem>
                        <SelectItem value="uk">United Kingdom</SelectItem>
                        <SelectItem value="ca">Canada</SelectItem>
                        <SelectItem value="au">Australia</SelectItem>
                        <SelectItem value="de">Germany</SelectItem>
                        <SelectItem value="fr">France</SelectItem>
                        <SelectItem value="jp">Japan</SelectItem>
                        <SelectItem value="in">India</SelectItem>
                        <SelectItem value="br">Brazil</SelectItem>
                        <SelectItem value="mx">Mexico</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Professional Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Professional Information</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Organization/Company
                    </label>
                    <Input
                      type="text"
                      value={enrollmentFormData.organization}
                      onChange={(e) => setEnrollmentFormData(prev => ({ ...prev, organization: e.target.value }))}
                      placeholder="Your company or organization"
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Job Title/Role
                    </label>
                    <Input
                      type="text"
                      value={enrollmentFormData.jobTitle}
                      onChange={(e) => setEnrollmentFormData(prev => ({ ...prev, jobTitle: e.target.value }))}
                      placeholder="e.g., Software Developer, Student, Manager"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Terms and Agreement */}
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      id="terms"
                      required
                      className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <label htmlFor="terms" className="text-sm text-gray-700">
                      I agree to the <a href="/terms" className="text-purple-600 hover:text-purple-800 underline">Terms of Service</a> and
                      <a href="/privacy" className="text-purple-600 hover:text-purple-800 underline ml-1">Privacy Policy</a>.
                      I understand that my information will be used to generate completion certificates.
                    </label>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-start space-x-3">
                      <MessageCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-medium text-blue-900">Certificate Information</h4>
                        <p className="text-sm text-blue-700 mt-1">
                          Upon successful completion of this course, you'll receive a professional certificate
                          featuring your name, completion date, and PiPilot branding.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowEnrollmentForm(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <UserCheck className="w-4 h-4 mr-2" />
                    Complete Enrollment
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <Footer />
    </div>
  )

}
