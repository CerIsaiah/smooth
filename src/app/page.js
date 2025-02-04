"use client"
import { Upload } from 'lucide-react'
import { useState } from 'react'
import { analyzeScreenshot } from './openai';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [responses, setResponses] = useState([]);
  const [mode, setMode] = useState('first-move');
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      alert('Please select a screenshot first');
      return;
    }

    try {
      setIsLoading(true);
      const result = await analyzeScreenshot(selectedFile, mode);
      setResponses(result); // Fixed: Using setResponses instead of setResponse
    } catch (error) {
      console.error('Error:', error);
      alert('Error analyzing screenshot. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#3B0664' }}>
      {/* Navigation */}
      <nav className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 sm:p-6 md:p-8 mb-10 md:mb-20">
        <h1 className="text-2xl sm:text-3xl font-bold text-cyan-300 tracking-tight">SmoothRizz</h1>
        <div className="flex gap-3 sm:gap-4">
          <button className="px-4 sm:px-6 py-2 rounded-full border-2 border-white text-white hover:bg-white/10 transition text-sm sm:text-base font-medium">
            Learn more
          </button>
          <button className="px-4 sm:px-6 py-2 rounded-full bg-white hover:bg-cyan-50 text-[#3B0664] transition text-sm sm:text-base font-bold shadow-lg">
            Get Started
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="px-4 sm:px-6 md:px-8">
        {/* Hero Section */}
        <section className="max-w-5xl mx-auto text-center mb-32">
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 leading-tight tracking-tight">
            Its Your Turn to be the
            <br />
            <span className="text-cyan-300 drop-shadow-lg">Smooth Talker</span>
          </h2>
          
          <p className="text-white text-lg sm:text-xl mb-8 sm:mb-12 md:mb-16 opacity-90">
            Drizzy Sounds Natural. Keeps it Chill. Seals the deal.
          </p>

          <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-center justify-center">
            {/* Mascot */}
            <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 bg-cyan-300 rounded-lg shrink-0 shadow-xl transform hover:scale-105 transition-transform duration-300"></div>

            <div className="flex flex-col gap-4 flex-1 w-full max-w-md">
              <div className="bg-cyan-300 rounded-3xl p-3 sm:p-4 mb-2 sm:mb-4 shadow-lg transform hover:scale-102 transition-transform duration-300">
                <p className="text-[#3B0664] text-base sm:text-lg font-medium">
                  Drop their text ✨ to get your 1st response!
                </p>
              </div>

              <label className="w-full border-2 border-dashed border-white rounded-3xl p-4 sm:p-6 text-white flex items-center justify-center gap-2 hover:bg-white/10 transition cursor-pointer shadow-lg">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Upload size={20} className="sm:w-6 sm:h-6" />
                <span className="font-medium">{selectedFile ? selectedFile.name : 'Upload a Screenshot!'}</span>
              </label>

              <div className="mt-6">
                <h3 className="text-white text-lg font-semibold mb-4">Choose where you are in the conversation:</h3>
                <div className="grid grid-cols-3 gap-2 sm:gap-4 bg-cyan-300 p-3 sm:p-4 rounded-3xl shadow-xl">
                  {['First Move', 'Mid-Game', 'End Game'].map((phase, index) => (
                    <div 
                      key={phase} 
                      className="bg-[#3B0664] rounded-xl sm:rounded-2xl p-2 sm:p-4 text-center cursor-pointer hover:bg-opacity-80 transition transform hover:scale-105 duration-300 shadow-md"
                      onClick={() => setMode(phase.toLowerCase().replace(' ', '-'))}
                    >
                      <span className="block text-xl sm:text-2xl mb-1">
                        {['👋', '💭', '🎯'][index]}
                      </span>
                      <span className="text-white text-xs sm:text-sm font-medium">{phase}</span>
                      <span className="block text-white/60 text-[10px] sm:text-xs">
                        {['Nail that opener', 'Keep it flowing', 'Bring it home'][index]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={isLoading || !selectedFile}
                className={`mt-4 w-full bg-white text-[#3B0664] rounded-3xl p-4 font-bold hover:bg-cyan-50 transition transform hover:scale-102 duration-300 shadow-lg ${
                  (isLoading || !selectedFile) ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isLoading ? 'Analyzing...' : 'Get Response'}
              </button>

              {responses.length > 0 && (
                <div className="bg-white text-[#3B0664] rounded-3xl p-6 mt-4 shadow-xl">
                  <h3 className="font-bold mb-4 text-lg">Suggested Responses:</h3>
                  <div className="space-y-4">
                    {responses.map((response, index) => (
                      <div key={index} className="bg-[#3B0664]/5 p-4 rounded-xl hover:bg-[#3B0664]/10 transition-all duration-300">
                        <p className="text-[#3B0664]/90">{response}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Analysis Section */}
        <section className="max-w-5xl mx-auto text-center mb-32">
          <h2 className="text-3xl sm:text-4xl font-bold mb-16 tracking-tight">
            <span className="text-white">Analyzing texts... </span>
            <span className="text-cyan-300 drop-shadow-lg">Calling Drizzy...</span>
          </h2>

          <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16">
            <div className="flex-1">
              <div className="space-y-4 max-w-md mx-auto">
                {responses.length > 0 ? responses.map((response, index) => (
                  <div key={index} className="bg-cyan-300 rounded-2xl p-4 text-[#3B0664] font-medium shadow-lg transform hover:scale-102 transition-all duration-300">
                    {response}
                  </div>
                )) : ['Who\'s your mommy?', 'I\'m your mommy.', 'Who\'s your mommy? Who\'s your mommy? Who\'s your mommy?'].map((msg, index) => (
                  <div key={index} className="bg-cyan-300 rounded-2xl p-4 text-[#3B0664] font-medium shadow-lg transform hover:scale-102 transition-all duration-300">
                    {msg}
                  </div>
                ))}
              </div>
            </div>
            <div className="w-32 h-32 sm:w-40 sm:h-40 shrink-0">
              <div className="w-full h-full bg-cyan-300 rounded-full flex items-center justify-center shadow-xl transform hover:scale-105 transition-transform duration-300">
                <span className="text-4xl">👨‍💼</span>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="max-w-5xl mx-auto pb-32">
          <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16">
            <div className="w-48 h-48 relative shrink-0">
              <div className="w-full h-full bg-cyan-300 rounded-full flex items-center justify-center shadow-xl transform hover:rotate-12 transition-transform duration-300">
                <span className="text-4xl">🦸‍♂️</span>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-cyan-300 text-sm font-medium rotate-[-30deg] drop-shadow-lg">
                  Why smoothRizz?
                </div>
              </div>
            </div>
            
            <div className="flex-1 space-y-8">
              {[
                {
                  title: 'Craft natural responses based on your goals',
                  desc: 'Get personalized suggestions that match your conversation style and objectives'
                },
                {
                  title: 'Skip the dry, awkward phases',
                  desc: 'Keep the conversation flowing naturally and maintain engagement'
                },
                {
                  title: 'Upload long conversations for Drizzy to analyze',
                  desc: 'Get comprehensive insights and suggestions for your entire chat history'
                }
              ].map((feature, index) => (
                <div key={index} className="bg-white/5 rounded-2xl p-6 backdrop-blur-sm hover:bg-white/10 transition-all duration-300 transform hover:scale-102 shadow-lg">
                  <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="text-white/80">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}