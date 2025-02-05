"use client"
import { Upload, ArrowDown } from 'lucide-react'
import { useState, useEffect } from 'react'
import { analyzeScreenshot } from './openai'

export default function Home() {
  const [isLoading, setIsLoading] = useState(false)
  const [responses, setResponses] = useState([])
  const [mode, setMode] = useState('first-move')
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    }
  }

  const handlePaste = (event) => {
    const items = event.clipboardData?.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile()
          setSelectedFile(file)
          const url = URL.createObjectURL(file)
          setPreviewUrl(url)
          break
        }
      }
    }
  }

  const handleSubmit = async () => {
    if (!selectedFile) {
      alert('Please select a screenshot first')
      return
    }

    try {
      setIsLoading(true)
      const result = await analyzeScreenshot(selectedFile, mode)
      
      // Handle array with string response
      if (Array.isArray(result) && result.length > 0) {
        const firstResponse = result[0]
        if (typeof firstResponse === 'string' && firstResponse.includes('|')) {
          const splitResponses = firstResponse.split('|').map(r => r.trim())
          setResponses(splitResponses.slice(0, 3))
        } else {
          setResponses(result.slice(0, 3))
        }
      }
      // Handle direct string response
      else if (typeof result === 'string') {
        if (result.includes('|')) {
          const splitResponses = result.split('|').map(r => r.trim())
          setResponses(splitResponses.slice(0, 3))
        } else {
          setResponses([result])
        }
      }

      // Scroll to responses section
      document.querySelector('#responses-section')?.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      })
    } catch (error) {
      console.error('Error:', error)
      alert('Error analyzing screenshot. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="flex justify-between items-center p-4 md:p-6 lg:p-8">
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: '#FE3C72' }}>
          SmoothRizz
        </h1>
        <div className="flex gap-3 md:gap-4">
          <a 
            href="/privacy-policy" 
            className="px-4 py-2 rounded-full text-gray-600 hover:text-gray-900 transition text-sm md:text-base"
          >
            Privacy Policy
          </a>
          <button className="px-4 py-2 rounded-full text-white hover:opacity-90 transition text-sm md:text-base font-medium" 
            style={{ backgroundColor: '#121418' }}>
            Get Started
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="px-4 md:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Hero Section */}
        <section className="text-center mb-16 md:mb-24">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 leading-tight" style={{ color: '#121418' }}>
            It's Your Turn to be the
            <br />
            <span style={{ color: '#FE3C72' }} className="drop-shadow-sm"><i>Smooth</i> Talker</span>
          </h2>
          
          <p className="text-gray-600 text-lg md:text-xl mb-12 md:mb-16 max-w-2xl mx-auto">
            Show Off Natural Rizz 
          </p>

          <div className="flex flex-col md:flex-row gap-8 md:gap-12 lg:gap-16 items-center md:items-start justify-center">
            {/* Left side - Phone mockup */}
            <div className="w-64 md:w-72 lg:w-80 shrink-0">
              <div className="bg-gray-100/50 rounded-3xl p-2 shadow-md transform transition-transform">
                <img 
                  src="/top_phone.png"
                  alt="iPhone mockup"
                  className="w-full rounded-2xl opacity-90"
                />
              </div>
            </div>

            {/* Right side - Upload section */}
            <div className="flex flex-col gap-4 flex-1 max-w-md w-full">
              {/* Upload Instructions */}
              <div className="text-gray-700 text-center mb-3 font-bold">
                Screenshot full conversation + text to respond to! 👇
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 bg-white relative hover:border-pink-300 transition-colors">
                <label className="flex flex-col items-center justify-center gap-2 cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Upload className="text-gray-400" size={24} />
                  <span className="text-gray-600 text-center">Upload or paste conversation Screenshot!</span>
                  <span className="text-gray-400 text-sm">Click to upload or Ctrl+V to paste</span>
                </label>
                {selectedFile && (
                  <div className="absolute top-2 right-2 px-3 py-1 rounded-full text-xs text-white"
                    style={{ backgroundColor: '#FE3C72' }}>
                    File uploaded ✨
                  </div>
                )}
              </div>

              <div className="mt-2">
                <h3 className="text-gray-900 text-lg mb-4 font-medium">Choose where you are in the conversation:</h3>
                <div className="grid grid-cols-3 gap-3 md:gap-4 p-4 rounded-2xl shadow-inner" 
                  style={{ backgroundColor: 'rgba(254, 60, 114, 0.1)' }}>
                  {[
                    { name: 'First Move', desc: 'Nail that opener', emoji: '👋' },
                    { name: 'Mid-Game', desc: 'Keep it flowing', emoji: '💭' },
                    { name: 'End Game', desc: 'Bring it home', emoji: '🎯' }
                  ].map((phase) => {
                    const isSelected = mode === phase.name.toLowerCase().replace(' ', '-')
                    return (
                      <div 
                        key={phase.name}
                        className={`rounded-xl p-3 md:p-4 text-center cursor-pointer hover:scale-[1.02] transition-all text-white shadow-lg ${
                          isSelected ? 'ring-4 ring-pink-400 ring-opacity-50' : ''
                        }`}
                        style={{ backgroundColor: '#121418' }}
                        onClick={() => setMode(phase.name.toLowerCase().replace(' ', '-'))}
                      >
                        <span className="block text-xl mb-1">{phase.emoji}</span>
                        <span className="text-sm font-medium">{phase.name}</span>
                        <span className="block text-xs text-white/60 mt-1">{phase.desc}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={isLoading || !selectedFile}
                className={`w-full text-white rounded-full p-4 font-bold shadow-lg transition-all ${
                  isLoading || !selectedFile ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02]'
                }`}
                style={{ backgroundColor: '#FE3C72' }}
              >
                {isLoading ? 'Analyzing...' : 'Get response'}
              </button>
            </div>
          </div>
        </section>

        {/* Arrow Divider */}
        <div className="flex justify-center mb-12 md:mb-16">
          <ArrowDown size={48} className="animate-bounce" style={{ color: '#FE3C72' }} />
        </div>

        {/* Analysis Section */}
        <section id="responses-section" className="mb-16 md:mb-24">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
            <span style={{ color: '#121418' }}>Analyzing texts... </span>
            <span style={{ color: '#FE3C72' }}>Predicting success...</span>
          </h2>

          <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start justify-center">
            {/* Left side - Conversation Preview */}
            <div className="w-full md:w-1/2 max-w-md">
              <h3 className="text-xl font-semibold mb-4 text-center" style={{ color: '#121418' }}>
                Your conversation
              </h3>
              {previewUrl ? (
                <img 
                  src={previewUrl} 
                  alt="Uploaded conversation" 
                  className="w-full rounded-xl"
                />
              ) : (
                <div className="w-full h-96 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
                  Your conversation will appear here
                </div>
              )}
            </div>

            {/* Right side - Responses */}
            <div className="w-full md:w-1/2 max-w-md">
              <h3 className="text-xl font-semibold mb-4 text-center" style={{ color: '#121418' }}>
                SmoothRizz suggestions ✨
              </h3>
              <div className="space-y-4">
                {[0, 1, 2].map((index) => (
                  <div 
                    key={index}
                    className="rounded-2xl p-4 text-white transform transition-all hover:scale-[1.01] max-w-[85%] relative" 
                    style={{ backgroundColor: '#FE3C72' }}
                  >
                    {responses[index] || `Response ${index + 1}`}
                    <div className="absolute -left-2 bottom-[45%] w-4 h-4 transform rotate-45" style={{ backgroundColor: '#FE3C72' }}></div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="mt-8 space-y-4">
                <button
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className={`w-[90%] mx-auto text-gray-900 rounded-full py-3 font-bold transition-all hover:scale-[1.02] border-2 border-gray-200 block ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isLoading ? 'Analyzing...' : 'Regenerate responses'}
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">or</span>
                  </div>
                </div>

                <button
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="w-[90%] mx-auto text-gray-900 rounded-full py-3 font-bold transition-all hover:scale-[1.02] border-2 border-gray-200 block"
                >
                  Try new screenshot
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Screenshot Section */}
        <section className="mb-16 md:mb-24">
          <div className="flex flex-col md:flex-row gap-8 md:gap-12 lg:gap-16 items-center justify-center">
            {/* Left side - Text content */}
            <div className="flex flex-col gap-4 max-w-md">
              <h2 className="text-4xl font-bold" style={{ color: '#121418' }}>
                It starts with a screenshot.
              </h2>
              <p className="text-lg" style={{ color: '#FE3C72' }}>
                Let SmoothRizz take the wheel with just a click.
              </p>
            </div>

            {/* Right side - Image */}
            <div className="max-w-md">
              <img 
                src="/two_phones.png"
                alt="Two phones showing the app interface"
                className="w-full rounded-2xl shadow-xl"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-8 md:gap-12 lg:gap-16 items-center justify-center mt-16">
            {/* Left side - Image */}
            <div className="max-w-md">
              <img 
                src="/drizzy_convo.png"
                alt="Example conversation"
                className="w-full rounded-2xl shadow-xl"
              />
            </div>

            {/* Right side - Text content */}
            <div className="flex flex-col gap-4 max-w-md">
              <h2 className="text-4xl font-bold" style={{ color: '#121418' }}>
                Rizz that adapts to you.
              </h2>
              <p className="text-lg" style={{ color: '#FE3C72' }}>
                Whether you're a jokester, a poet, or a smooth talker, we all have something smooth to say
              </p>
            </div>
          </div>
        </section>

        {/* Bottom Section with Wave */}
        <section className="relative pb-24 md:pb-32 text-center">
          <div className="absolute bottom-0 left-0 right-0 h-64 rounded-t-full -z-10" 
            style={{ backgroundColor: '#121418' }} />
          
          <div className="relative inline-block mb-8">
            <div className="text-xl font-bold rotate-[-30deg] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
              style={{ color: '#FE3C72' }}>
              Why SmoothRizz?
            </div>
            <div className="w-36 h-36 md:w-48 md:h-48 rounded-full border-4 flex items-center justify-center bg-white shadow-xl transform transition-transform hover:rotate-12"
              style={{ borderColor: '#FE3C72' }}>
              <span className="text-4xl md:text-5xl">🦸‍♂️</span>
            </div>
          </div>

          <div className="mt-8 relative z-10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Charm. Confidence. Chemistry.
            </h2>
            <p className="text-white text-lg md:text-xl">
              We Make It Effortless.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}