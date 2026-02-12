'use client'

import { useState, useRef } from 'react'
import { usePageTitle } from '@/hooks/use-page-title'

type Mode = 'clone' | 'debug' | 'context'

export default function TestVisionPage() {
  usePageTitle('Vision Test')
  const [image, setImage] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('context')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      setImage(event.target?.result as string)
      setError('')
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (event) => {
            setImage(event.target?.result as string)
            setError('')
          }
          reader.readAsDataURL(file)
        }
        break
      }
    }
  }

  const analyzeImage = async () => {
    if (!image) {
      setError('Please upload an image first')
      return
    }

    setLoading(true)
    setError('')
    setResponse('')

    try {
      const res = await fetch('/api/describe-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image,
          mode,
          userMessage: prompt || undefined,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || `API Error: ${res.status}`)
      }

      const data = await res.json()

      if (data.success) {
        if (data.specification) {
          setResponse(JSON.stringify(data.specification, null, 2))
        } else {
          setResponse(data.description || data.raw || 'No response')
        }
      } else {
        throw new Error(data.error || 'Unknown error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8" onPaste={handlePaste}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Vision API Test</h1>
        <p className="text-gray-400 mb-8">Test image analysis via Mistral Devstral (Gateway)</p>

        <div className="space-y-6">
          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Analysis Mode</label>
            <div className="flex gap-4">
              <button
                onClick={() => setMode('clone')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  mode === 'clone'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Clone (JSON)
              </button>
              <button
                onClick={() => setMode('debug')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  mode === 'debug'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Debug
              </button>
              <button
                onClick={() => setMode('context')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  mode === 'context'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Context
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {mode === 'clone' && 'Outputs structured JSON for UI recreation'}
              {mode === 'debug' && 'Identifies visual issues and suggests fixes'}
              {mode === 'context' && 'General description for reference'}
            </p>
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium mb-2">Image</label>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                image ? 'border-green-500 bg-green-500/10' : 'border-gray-600 hover:border-gray-500'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              {image ? (
                <div className="space-y-4">
                  <img
                    src={image}
                    alt="Uploaded"
                    className="max-h-64 mx-auto rounded-lg"
                  />
                  <p className="text-green-400">Image loaded. Click to change.</p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-400">Click to upload or paste an image (Ctrl+V)</p>
                  <p className="text-sm text-gray-500 mt-2">Supports PNG, JPG, GIF, WebP</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          {/* Optional Prompt */}
          <div>
            <label className="block text-sm font-medium mb-2">Additional Context (optional)</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add any context about what you want to analyze..."
            />
          </div>

          {/* Analyze Button */}
          <button
            onClick={analyzeImage}
            disabled={loading || !image}
            className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
              loading || !image
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {loading ? 'Analyzing...' : 'Analyze Image'}
          </button>

          {/* Error Display */}
          {error && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-4">
              <p className="text-red-400 font-medium">Error</p>
              <p className="text-red-300 text-sm mt-1 whitespace-pre-wrap">{error}</p>
            </div>
          )}

          {/* Response Display */}
          {response && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-gray-400 font-medium mb-2">Analysis Result ({mode} mode)</p>
              <div className="prose prose-invert max-w-none">
                <pre className="whitespace-pre-wrap text-sm overflow-x-auto">{response}</pre>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-gray-500 mt-8 bg-gray-800/50 rounded-lg p-4">
            <p className="font-medium mb-2">API Info:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Endpoint: /api/describe-image</li>
              <li>Model: mistral/devstral-small-2 (via Vercel AI Gateway)</li>
              <li>Image loaded: {image ? 'Yes' : 'No'}</li>
              {image && <li>Image size: {Math.round(image.length / 1024)} KB</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
