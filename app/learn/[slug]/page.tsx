"use client"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  BookOpen, Video, Play, Users, Clock, Star, ArrowRight, MessageSquare, Code, Rocket, Layers, Settings,
  Search, Filter, CheckCircle, TrendingUp, Award, Target, Lightbulb, Zap, BarChart3, X, GraduationCap,
  PlayCircle, FileText, Trophy, Calendar, User, Check, Lock, Unlock, Download, Share2,
  ChevronDown, ChevronRight, Book, Brain, Code2, Palette, Database, Globe, Smartphone, Award as CertificateIcon,
  ArrowLeft, ExternalLink, UserCheck, MessageCircle, Phone, DollarSign
} from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { useEffect, useState } from "react"
import { usePageTitle } from '@/hooks/use-page-title'

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
  featured: boolean
  enrolled: boolean
  progress: number
  completed: boolean
  certificateAvailable: boolean
  skills: string[]
  prerequisites: string[]
  content: {
    overview: string
    learningObjectives: string[]
    modules: any[]
    resources: any[]
    tutoring: any
  }
}

interface UserProgress {
  userId: string
  userProfile?: {
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
  enrolledCourses: string[]
  completedCourses: string[]
  courseProgress: { [courseId: string]: { [moduleId: string]: { [lessonId: string]: boolean } } }
  certificates: string[]
  totalTimeSpent: number
  lastActive: string
}

export default function CoursePage() {
  usePageTitle('Learn')
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [course, setCourse] = useState<Course | null>(null)
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeModule, setActiveModule] = useState(0)
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set([0]))
  const [showCertificate, setShowCertificate] = useState(false)

  // WhatsApp booking function
  const handleWhatsAppBooking = (session: any, tutor: any) => {
    const userPhone = "+237679719353" // User's WhatsApp number
    const tutorPhone = tutor.phone.replace(/[^0-9]/g, '') // Clean tutor's phone number

    const message = encodeURIComponent(
      `Hi ${tutor.name}!\n\n` +
      `I'm interested in booking a ${session.title} session.\n\n` +
      `Session Details:\n` +
      `• Duration: ${session.duration}\n` +
      `• Type: ${session.type}\n` +
      `• Price: ${session.price}\n\n` +
      `My WhatsApp number: ${userPhone}\n\n` +
      `Course: ${course?.title}\n` +
      `Please let me know the available time slots and next steps for booking.\n\n` +
      `Thank you!`
    )

    const whatsappUrl = `https://wa.me/${tutorPhone}?text=${message}`

    // Open WhatsApp in new tab
    window.open(whatsappUrl, '_blank')

    // Show success message (you could add a toast notification here)
    alert(`Opening WhatsApp chat with ${tutor.name}. Please complete your booking there.`)
  }

  // Image API utility function
  const getCourseThumbnail = (courseTitle: string, seed: number) => {
    const description = `${courseTitle} course thumbnail, professional educational content`
    return `https://api.a0.dev/assets/image?text=${encodeURIComponent(description)}&aspect=1:1&seed=${seed}`
  }

  // Load course and user progress
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load courses from JSON
        const coursesResponse = await fetch('/courses.json')
        const coursesData = await coursesResponse.json()

        // Find the specific course
        const foundCourse = coursesData.courses.find((c: Course) => c.id === slug)
        if (!foundCourse) {
          router.push('/learn')
          return
        }

        // Load user progress
        const progress = localStorage.getItem('pixelPilotUserProgress')
        if (progress) {
          const progressData = JSON.parse(progress)
          setUserProgress(progressData)

          // Check if user is enrolled
          if (progressData.enrolledCourses.includes(foundCourse.id)) {
            foundCourse.enrolled = true
            foundCourse.progress = calculateProgress(foundCourse.id, progressData)
          }
        }

        setCourse(foundCourse)
      } catch (error) {
        console.error('Failed to load course:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [slug, router])

  const calculateProgress = (courseId: string, progress: UserProgress): number => {
    const courseProgress = progress.courseProgress[courseId]
    if (!courseProgress) return 0

    let totalLessons = 0
    let completedLessons = 0

    Object.values(courseProgress).forEach((module: any) => {
      Object.values(module).forEach((lesson: any) => {
        totalLessons++
        if (lesson) completedLessons++
      })
    })

    return totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
  }

  const enrollInCourse = () => {
    if (!course || !userProgress) return

    const updatedProgress = {
      ...userProgress,
      enrolledCourses: [...userProgress.enrolledCourses, course.id],
      courseProgress: {
        ...userProgress.courseProgress,
        [course.id]: {}
      },
      lastActive: new Date().toISOString()
    }

    setUserProgress(updatedProgress)
    localStorage.setItem('pixelPilotUserProgress', JSON.stringify(updatedProgress))

    setCourse({ ...course, enrolled: true })
  }

  const completeLesson = (moduleId: string, lessonId: string) => {
    if (!course || !userProgress) return

    const updatedProgress = {
      ...userProgress,
      courseProgress: {
        ...userProgress.courseProgress,
        [course.id]: {
          ...userProgress.courseProgress[course.id],
          [moduleId]: {
            ...userProgress.courseProgress[course.id]?.[moduleId],
            [lessonId]: true
          }
        }
      },
      lastActive: new Date().toISOString()
    }

    setUserProgress(updatedProgress)
    localStorage.setItem('pixelPilotUserProgress', JSON.stringify(updatedProgress))

    // Update course progress
    const newProgress = calculateProgress(course.id, updatedProgress)
    setCourse({ ...course, progress: newProgress })

    // Check if course is completed
    if (newProgress === 100 && !course.completed) {
      completeCourse(course.id, updatedProgress)
    }
  }

  const completeCourse = (courseId: string, currentProgress: UserProgress) => {
    const updatedProgress = {
      ...currentProgress,
      completedCourses: [...currentProgress.completedCourses, courseId],
      certificates: [...currentProgress.certificates, courseId],
      lastActive: new Date().toISOString()
    }

    setUserProgress(updatedProgress)
    localStorage.setItem('pixelPilotUserProgress', JSON.stringify(updatedProgress))

    // Update course status
    setCourse(prev => prev ? { ...prev, completed: true, certificateAvailable: true } : null)
  }

  const toggleModule = (index: number) => {
    const newExpanded = new Set(expandedModules)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedModules(newExpanded)
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

  const handleContinueLearning = () => {
    if (!course || !userProgress) return

    const courseProgress = userProgress.courseProgress[course.id] || {}
    const modules = course.content.modules || []

    // Find the first incomplete module
    for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex++) {
      const module = modules[moduleIndex]
      const moduleProgress = courseProgress[module.id] || {}

      // Find the first incomplete lesson in this module
      for (let lessonIndex = 0; lessonIndex < module.lessons.length; lessonIndex++) {
        const lesson = module.lessons[lessonIndex]
        if (!moduleProgress[lesson.id]) {
          // Found the first incomplete lesson, expand the module and scroll to it
          setActiveModule(1) // Switch to curriculum tab
          setExpandedModules(new Set([moduleIndex]))

          // Scroll to the curriculum section after a short delay
          setTimeout(() => {
            const curriculumElement = document.getElementById('curriculum-section')
            if (curriculumElement) {
              curriculumElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          }, 100)

          return
        }
      }
    }

    // If all lessons are complete, show completion message or navigate to certificate
    if (course.completed && course.certificateAvailable) {
      // Could navigate to certificate or show completion modal
      console.log('Course completed! Certificate available.')
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
            <p className="text-white">Loading course...</p>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  if (!course) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <Navigation />
        <div className="relative z-10 pt-16 pb-24 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Course Not Found</h2>
            <p className="text-gray-400 mb-6">The course you're looking for doesn't exist.</p>
            <Link href="/learn">
              <Button className="bg-purple-600 hover:bg-purple-700">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Courses
              </Button>
            </Link>
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
          {/* Breadcrumb */}
          <div className="mb-6">
            <Link href="/learn" className="text-gray-400 hover:text-white flex items-center">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Courses
            </Link>
          </div>

          {/* Course Header */}
          <div className="mb-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
              <div>
                <div className="flex items-center space-x-3 mb-4">
                  <Badge className="bg-purple-600 text-white">{course.category}</Badge>
                  <Badge className={getDifficultyColor(course.level)}>
                    {course.level}
                  </Badge>
                </div>

                <h1 className="text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
                  {course.title}
                </h1>

                <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                  {course.longDescription}
                </p>

                {/* Course Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white mb-2">{course.duration}</div>
                    <div className="text-gray-400">Duration</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white mb-2">{course.students.toLocaleString()}</div>
                    <div className="text-gray-400">Students</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white mb-2">{course.rating}</div>
                    <div className="text-gray-400">Rating</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white mb-2">{course.content.modules.length}</div>
                    <div className="text-gray-400">Modules</div>
                  </div>
                </div>

                {/* Instructor */}
                <div className="flex items-center space-x-4 mb-8">
                  <div className="w-12 h-12 rounded-full overflow-hidden">
                    <img src="/hans.png" alt={course.instructor} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="text-white font-semibold">{course.instructor}</div>
                    <div className="text-gray-400">Founder & CEO, PiPilot</div>
                    <div className="text-gray-500 text-sm">Also known as Hans Ade</div>
                  </div>
                </div>

                {/* Skills */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-white mb-4">What you'll learn:</h3>
                  <div className="flex flex-wrap gap-2">
                    {course.skills.map((skill, index) => (
                      <Badge key={index} variant="outline" className="border-gray-600 text-gray-400">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4">
                  {course.enrolled ? (
                    <>
                      {course.completed ? (
                        <>
                          <Button
                            size="lg"
                            className="bg-green-600 hover:bg-green-700 text-white px-8"
                            onClick={() => setShowCertificate(true)}
                          >
                            <Trophy className="w-5 h-5 mr-2" />
                            View Certificate
                          </Button>
                          <div className="flex items-center space-x-2 text-green-400">
                            <CheckCircle className="w-5 h-5" />
                            <span className="font-semibold">Course Completed!</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <Button
                            size="lg"
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                            onClick={handleContinueLearning}
                          >
                            <PlayCircle className="w-5 h-5 mr-2" />
                            Continue Learning
                          </Button>
                          {course.progress > 0 && (
                            <div className="flex items-center space-x-2 text-gray-300">
                              <span>Progress:</span>
                              <span className="font-semibold">{course.progress}%</span>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <Button
                      size="lg"
                      className="bg-purple-600 hover:bg-purple-700 text-white px-8"
                      onClick={() => window.location.href = `/learn?enroll=${course.id}`}
                    >
                      <BookOpen className="w-5 h-5 mr-2" />
                      Enroll Now - {course.price}
                    </Button>
                  )}
                </div>
              </div>

              {/* Course Thumbnail */}
              <div className="lg:sticky lg:top-24">
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50">
                  <div className="aspect-video bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg mb-6 flex items-center justify-center">
                    <img
                      src={getCourseThumbnail(course.title, course.students)}
                      alt={course.title}
                      className="w-full h-full object-cover rounded-lg"
                      onError={(e) => {
                        const target = e.currentTarget as HTMLElement
                        target.style.display = 'none'
                        const sibling = target.nextElementSibling as HTMLElement
                        if (sibling) sibling.style.display = 'flex'
                      }}
                    />
                    <div className="w-full h-full flex items-center justify-center rounded-lg" style={{ display: 'none' }}>
                      <GraduationCap className="w-16 h-16 text-white" />
                    </div>
                  </div>

                  {course.enrolled && (
                    <div className="mb-6">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-400">Course Progress</span>
                        <span className="text-white">{course.progress}%</span>
                      </div>
                      <Progress value={course.progress} className="h-2" />
                    </div>
                  )}

                  {/* Course Actions */}
                  <div className="space-y-3">
                    <Button className="w-full bg-purple-600 hover:bg-purple-700">
                      <Share2 className="w-4 h-4 mr-2" />
                      Share Course
                    </Button>
                    <Button variant="outline" className="w-full border-gray-600 text-gray-300 hover:text-white">
                      <Download className="w-4 h-4 mr-2" />
                      Download Syllabus
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Course Content Tabs */}
          <div className="mb-12">
            <div className="border-b border-gray-700/50">
              <nav className="flex space-x-8">
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'curriculum', label: 'Curriculum' },
                  { id: 'resources', label: 'Resources' },
                  { id: 'tutoring', label: 'Tutoring' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveModule(activeModule === 0 ? 1 : 0)} // Simple toggle for demo
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeModule === 0
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Course Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
            <div className="lg:col-span-2">
              <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white">Course Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300 mb-6">{course.content.overview}</p>

                  <h4 className="text-lg font-semibold text-white mb-4">Learning Objectives</h4>
                  <ul className="space-y-2">
                    {course.content.learningObjectives.map((objective, index) => (
                      <li key={index} className="flex items-start space-x-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-300">{objective}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm mb-6">
                <CardHeader>
                  <CardTitle className="text-white">Prerequisites</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {course.prerequisites.map((prereq, index) => (
                      <li key={index} className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-purple-400 rounded-full mt-2 flex-shrink-0"></div>
                        <span className="text-gray-300">{prereq}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white">Course Rating</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-5 h-5 ${
                            i < Math.floor(course.rating)
                              ? 'text-yellow-400 fill-current'
                              : 'text-gray-600'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-white font-semibold">{course.rating}</span>
                    <span className="text-gray-400">({course.students.toLocaleString()} reviews)</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Course Curriculum */}
          <Card id="curriculum-section" className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm mb-12">
            <CardHeader>
              <CardTitle className="text-white">Course Curriculum</CardTitle>
              <CardDescription className="text-gray-400">
                {course.content.modules.length} modules • Complete learning path
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {course.content.modules.map((module, moduleIndex) => (
                  <div key={module.id} className="border border-gray-700/50 rounded-lg">
                    <button
                      onClick={() => toggleModule(moduleIndex)}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-700/30 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                          {moduleIndex + 1}
                        </div>
                        <div>
                          <h4 className="text-white font-semibold">{module.title}</h4>
                          <p className="text-gray-400 text-sm">{module.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-gray-400 text-sm">{module.duration}</span>
                        {expandedModules.has(moduleIndex) ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {expandedModules.has(moduleIndex) && (
                      <div className="px-4 pb-4">
                        <div className="space-y-2">
                          {module.lessons.map((lesson: any, lessonIndex: number) => (
                            <div key={lesson.id} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                              <div className="flex items-center space-x-3">
                                <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center">
                                  {lesson.type === 'video' ? (
                                    <Play className="w-3 h-3 text-gray-300" />
                                  ) : lesson.type === 'text' ? (
                                    <FileText className="w-3 h-3 text-gray-300" />
                                  ) : (
                                    <Code className="w-3 h-3 text-gray-300" />
                                  )}
                                </div>
                                <div>
                                  <h5 className="text-white text-sm font-medium">{lesson.title}</h5>
                                  <p className="text-gray-400 text-xs">{lesson.duration}</p>
                                </div>
                              </div>

                              {course.enrolled ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-gray-600 text-gray-300 hover:text-white"
                                  onClick={() => completeLesson(module.id, lesson.id)}
                                >
                                  {lesson.completed ? (
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                  ) : (
                                    <Play className="w-4 h-4" />
                                  )}
                                </Button>
                              ) : (
                                <Lock className="w-4 h-4 text-gray-500" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Resources Section */}
          {course.content.resources && course.content.resources.length > 0 && (
            <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm mb-12">
              <CardHeader>
                <CardTitle className="text-white">Additional Resources</CardTitle>
                <CardDescription className="text-gray-400">
                  Helpful materials and references for this course
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {course.content.resources.map((resource, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <ExternalLink className="w-5 h-5 text-purple-400" />
                        <div>
                          <h5 className="text-white text-sm font-medium">{resource.title}</h5>
                          <p className="text-gray-400 text-xs">{resource.description}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="border-gray-600">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tutoring Section */}
          {course.content.tutoring && course.content.tutoring.available && (
            <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <MessageCircle className="w-6 h-6 text-green-400" />
                  <span>Personal Tutoring</span>
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Get personalized help from our expert tutors via WhatsApp
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Tutor Information */}
                {course.content.tutoring.tutor && (
                  <div className="mb-6 p-4 bg-gradient-to-r from-green-900/20 to-blue-900/20 rounded-lg border border-green-500/20">
                    <div className="flex items-center space-x-3 mb-2">
                      <User className="w-5 h-5 text-green-400" />
                      <h4 className="text-white font-medium">{course.content.tutoring.tutor.name}</h4>
                      <Badge variant="secondary" className="bg-green-600/20 text-green-400">
                        {course.content.tutoring.tutor.specialization}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-400">
                      <span className="flex items-center space-x-1">
                        <Phone className="w-4 h-4" />
                        <span>WhatsApp Available</span>
                      </span>
                      <span>{course.content.tutoring.tutor.experience} Experience</span>
                    </div>
                  </div>
                )}

                {/* Available Sessions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {course.content.tutoring.sessions.map((session: any, index: number) => (
                    <div key={index} className="p-4 bg-gray-700/30 rounded-lg border border-gray-600/30">
                      <div className="flex items-center space-x-3 mb-3">
                        <UserCheck className="w-5 h-5 text-green-400" />
                        <h5 className="text-white font-medium">{session.title}</h5>
                      </div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-gray-400 text-sm">{session.duration} • {session.type}</p>
                        <div className="flex items-center space-x-1 text-green-400">
                          <DollarSign className="w-4 h-4" />
                          <span className="font-medium">{session.price}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
                        disabled={!session.available}
                        onClick={() => handleWhatsAppBooking(session, course.content.tutoring.tutor)}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        {session.available ? 'Book via WhatsApp' : 'Unavailable'}
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Booking Instructions */}
                <div className="mt-6 p-4 bg-blue-900/20 rounded-lg border border-blue-500/20">
                  <h5 className="text-white font-medium mb-2">How to Book:</h5>
                  <ol className="text-gray-400 text-sm space-y-1">
                    <li>1. Click "Book via WhatsApp" on your preferred session</li>
                    <li>2. WhatsApp will open with a pre-filled booking message</li>
                    <li>3. Send the message to start your booking process</li>
                    <li>4. Your tutor will confirm available time slots</li>
                    <li>5. Complete payment and get your session link</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Certificate Modal */}
      {showCertificate && course && userProgress && (
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
                    <div className="flex justify-center mb-6">
                      <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center shadow-lg">
                        <img src="/logo.png" alt="PiPilot" className="w-10 h-10" />
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
                    <Award className="w-8 h-8 text-purple-600" />
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
                        {course.title}
                      </h3>
                      <div className="flex justify-center items-center space-x-4 text-sm text-gray-600">
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {course.duration}
                        </span>
                        <span className="flex items-center">
                          <Star className="w-4 h-4 mr-1 text-yellow-500" />
                          {course.rating}/5.0
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
                        {course.content?.modules?.length || 0}
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
                          PP-{course.id.toUpperCase()}-{Date.now()}
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
                          <img src="/logo.png" alt="PiPilot" className="w-4 h-4" />
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

      {/* Footer */}
      <Footer />
    </div>
  )
}
