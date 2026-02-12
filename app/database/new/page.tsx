"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Database, Loader2, ArrowLeft, ArrowRight, Sparkles, Check, Globe, Zap } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { usePageTitle } from '@/hooks/use-page-title'

export default function NewDatabasePage() {
  usePageTitle('New Database')
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [creating, setCreating] = useState(false)
    
    // Form data (only name is sent to API)
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        region: 'us-east-1',
        useCase: ''
    })

    const steps = [
        { number: 1, title: "Basic Info", description: "Name your database" },
        { number: 2, title: "Configuration", description: "Choose your settings" },
        { number: 3, title: "Review", description: "Confirm and create" }
    ]

    async function createDatabase() {
        if (!formData.name || formData.name.trim().length === 0) {
            toast.error('Please enter a database name')
            return
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(formData.name.trim())) {
            toast.error('Database name can only contain letters, numbers, underscores, and hyphens')
            return
        }

        try {
            setCreating(true)

            // Generate unique project ID with timestamp
            const projectId = `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

            // Only send name and projectId to API (description, region, useCase are just for UX)
            const response = await fetch('/api/database/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: projectId,
                    name: formData.name.trim()
                })
            })

            const data = await response.json()

            if (!response.ok) {
                toast.error(data.error || `Failed to create database (Error ${response.status})`)
                return
            }

            // Store the new database ID
            localStorage.setItem('user_database_id', data.database.id.toString())

            toast.success('Database created successfully!', {
                description: `${data.database.name} is ready to use`
            })

            // Redirect to database overview
            router.push('/database')
            router.refresh()
        } catch (error) {
            console.error('Error creating database:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to create database. Please try again.')
        } finally {
            setCreating(false)
        }
    }

    const handleNext = () => {
        if (step === 1 && !formData.name) {
            toast.error('Please enter a database name')
            return
        }
        if (step === 1 && !/^[a-zA-Z0-9_-]+$/.test(formData.name)) {
            toast.error('Database name can only contain letters, numbers, underscores, and hyphens')
            return
        }
        setStep(step + 1)
    }

    const handleBack = () => {
        setStep(step - 1)
    }

    return (
        <div className="min-h-screen bg-gray-950">
            <div className="fixed inset-0 bg-gradient-to-br from-purple-900/20 via-gray-900 to-blue-900/20" />
            <div className="fixed inset-0 bg-[url('/noise.svg')] opacity-[0.015]" />

            <div className="relative z-10 p-8">
                {/* Back Button */}
                <Link href="/database">
                    <Button variant="ghost" className="mb-6 text-gray-400 hover:text-white">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Databases
                    </Button>
                </Link>

                <div className="max-w-3xl mx-auto">
                    {/* Header */}
                    <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20 mb-4">
                            <Database className="h-8 w-8 text-purple-400" />
                        </div>
                        <h1 className="text-4xl font-bold text-white mb-2">
                            Create New Database
                        </h1>
                        <p className="text-gray-400 text-lg">
                            Step {step} of {steps.length}: {steps[step - 1].description}
                        </p>
                    </div>

                    {/* Progress Steps */}
                    <div className="mb-8">
                        <div className="flex items-center justify-between">
                            {steps.map((s, index) => (
                                <div key={s.number} className="flex items-center flex-1">
                                    <div className="flex flex-col items-center flex-1">
                                        <div className={cn(
                                            "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                                            step > s.number ? "bg-purple-500 border-purple-500" :
                                            step === s.number ? "bg-purple-500/20 border-purple-500" :
                                            "bg-gray-800 border-gray-700"
                                        )}>
                                            {step > s.number ? (
                                                <Check className="h-5 w-5 text-white" />
                                            ) : (
                                                <span className={cn(
                                                    "text-sm font-semibold",
                                                    step === s.number ? "text-purple-400" : "text-gray-500"
                                                )}>{s.number}</span>
                                            )}
                                        </div>
                                        <div className="mt-2 text-center">
                                            <p className={cn(
                                                "text-xs font-medium",
                                                step >= s.number ? "text-white" : "text-gray-500"
                                            )}>{s.title}</p>
                                        </div>
                                    </div>
                                    {index < steps.length - 1 && (
                                        <div className={cn(
                                            "h-0.5 flex-1 mx-2 transition-all duration-300",
                                            step > s.number ? "bg-purple-500" : "bg-gray-700"
                                        )} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Form Card */}
                    <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                        <CardHeader>
                            <CardTitle className="text-white">{steps[step - 1].title}</CardTitle>
                            <CardDescription>{steps[step - 1].description}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Step 1: Basic Info */}
                            {step === 1 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="space-y-2">
                                        <Label htmlFor="name" className="text-white">
                                            Database Name *
                                        </Label>
                                        <Input
                                            id="name"
                                            placeholder="my_awesome_db"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleNext()
                                            }}
                                            className="bg-gray-900/50 border-white/10 text-white placeholder:text-gray-500 h-12 text-lg"
                                            autoFocus
                                        />
                                        <p className="text-xs text-gray-500">
                                            Use letters, numbers, underscores, and hyphens only
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="description" className="text-white">
                                            Description (Optional)
                                        </Label>
                                        <Textarea
                                            id="description"
                                            placeholder="A brief description of what this database will be used for..."
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            className="bg-gray-900/50 border-white/10 text-white placeholder:text-gray-500 min-h-[100px]"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Configuration */}
                            {step === 2 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="space-y-2">
                                        <Label className="text-white">Region</Label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[
                                                { value: 'us-east-1', label: 'US East', icon: Globe },
                                                { value: 'us-west-1', label: 'US West', icon: Globe },
                                                { value: 'eu-west-1', label: 'Europe', icon: Globe },
                                                { value: 'ap-south-1', label: 'Asia Pacific', icon: Globe },
                                            ].map((region) => (
                                                <button
                                                    key={region.value}
                                                    onClick={() => setFormData({ ...formData, region: region.value })}
                                                    className={cn(
                                                        "p-4 rounded-lg border-2 transition-all duration-200 text-left",
                                                        formData.region === region.value
                                                            ? "border-purple-500 bg-purple-500/10"
                                                            : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <region.icon className={cn(
                                                            "h-4 w-4",
                                                            formData.region === region.value ? "text-purple-400" : "text-gray-400"
                                                        )} />
                                                        <span className={cn(
                                                            "font-medium",
                                                            formData.region === region.value ? "text-white" : "text-gray-300"
                                                        )}>{region.label}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-500">{region.value}</p>
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">
                                            💡 This is for display only - all databases use the same infrastructure
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="useCase" className="text-white">
                                            Primary Use Case (Optional)
                                        </Label>
                                        <Input
                                            id="useCase"
                                            placeholder="e.g., E-commerce, Analytics, User Management..."
                                            value={formData.useCase}
                                            onChange={(e) => setFormData({ ...formData, useCase: e.target.value })}
                                            className="bg-gray-900/50 border-white/10 text-white placeholder:text-gray-500"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Step 3: Review */}
                            {step === 3 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="rounded-lg border border-white/10 bg-gray-900/30 p-6 space-y-4">
                                        <h3 className="font-semibold text-white text-lg flex items-center gap-2">
                                            <Sparkles className="h-5 w-5 text-purple-400" />
                                            Review Your Database
                                        </h3>
                                        
                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">Database Name</p>
                                                <p className="text-white font-medium">{formData.name}</p>
                                            </div>
                                            
                                            {formData.description && (
                                                <div>
                                                    <p className="text-xs text-gray-500 mb-1">Description</p>
                                                    <p className="text-gray-300 text-sm">{formData.description}</p>
                                                </div>
                                            )}
                                            
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">Region</p>
                                                <p className="text-gray-300 text-sm">{formData.region}</p>
                                            </div>
                                            
                                            {formData.useCase && (
                                                <div>
                                                    <p className="text-xs text-gray-500 mb-1">Use Case</p>
                                                    <p className="text-gray-300 text-sm">{formData.useCase}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-white/10 bg-gray-900/30 p-6 space-y-3">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Zap className="h-5 w-5 text-purple-400" />
                                            <h3 className="font-semibold text-white text-lg">What you'll get:</h3>
                                        </div>
                                        <ul className="space-y-3 text-sm text-gray-300">
                                            <li className="flex items-start gap-3">
                                                <span className="text-purple-400 text-lg">✓</span>
                                                <span>500MB PostgreSQL database with full admin access</span>
                                            </li>
                                            <li className="flex items-start gap-3">
                                                <span className="text-purple-400 text-lg">✓</span>
                                                <span>Auto-generated REST APIs for all tables</span>
                                            </li>
                                            <li className="flex items-start gap-3">
                                                <span className="text-purple-400 text-lg">✓</span>
                                                <span>File storage with 500MB capacity</span>
                                            </li>
                                            <li className="flex items-start gap-3">
                                                <span className="text-purple-400 text-lg">✓</span>
                                                <span>Built-in authentication system</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Navigation Buttons */}
                            <div className="flex gap-3 pt-4">
                                {step > 1 && (
                                    <Button
                                        onClick={handleBack}
                                        variant="outline"
                                        className="flex-1 h-12 border-white/10 bg-gray-800/50 hover:bg-gray-800 text-white"
                                        disabled={creating}
                                    >
                                        <ArrowLeft className="h-4 w-4 mr-2" />
                                        Back
                                    </Button>
                                )}
                                
                                {step < 3 ? (
                                    <Button
                                        onClick={handleNext}
                                        className="flex-1 h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-lg shadow-purple-500/20"
                                    >
                                        Next
                                        <ArrowRight className="h-4 w-4 ml-2" />
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={createDatabase}
                                        disabled={creating}
                                        className="flex-1 h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-lg shadow-purple-500/20"
                                    >
                                        {creating ? (
                                            <>
                                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                                Creating Database...
                                            </>
                                        ) : (
                                            <>
                                                <Database className="mr-2 h-5 w-5" />
                                                Create Database
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
