import { Upload } from "lucide-react";

/**
 * Step 1 card: screenshot upload zone (with paste support handled by the
 * page-wide listener) plus the collapsible text-input section passed as children.
 */
export function StepUploadCard({ completed, onFileUpload, onNewScreenshot, children }) {
  return (
    <div id="step-1" className="bg-white rounded-xl shadow-lg border border-gray-100 transform transition-all hover:scale-[1.01] hover:shadow-xl">
      <div className="p-4 sm:p-5 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-rose-50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center">
            <span className="text-xl font-semibold text-pink-500">1</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Share Your Conversation</h2>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 bg-gray-50/50 relative hover:border-pink-200 transition-colors">
          {completed ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center justify-center gap-3">
                <div className="bg-green-50 p-2 rounded-full">
                  <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-green-600 font-medium">Upload Complete!</p>
              </div>

              {/* Add new upload button */}
              <label className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer text-gray-700 text-sm">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onNewScreenshot(e.target.files[0])}
                  className="hidden"
                />
                <Upload size={16} />
                Upload New Screenshot
              </label>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-3 cursor-pointer">
              <input type="file" accept="image/*" onChange={onFileUpload} className="hidden" />
              <Upload className="text-pink-500" size={28} />
              <div className="text-center">
                <p className="text-gray-700 font-medium mb-1">
                  Upload Conversation Screenshot!
                </p>
                <p className="text-gray-500 text-sm">
                  Press This or Ctrl+V to paste
                </p>
              </div>
            </label>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
