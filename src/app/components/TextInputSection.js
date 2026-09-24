/**
 * Collapsible text-input alternative to the screenshot upload, with the two
 * required fields (context + their last message).
 */
export function TextInputSection({ showTextInput, onToggle, context, lastText, onTextInputChange }) {
  return (
    <div className="mt-4 transition-all duration-300">
      <button
        onClick={onToggle}
        className="w-full text-gray-600 py-2 flex items-center justify-center gap-2 hover:text-gray-900"
      >
        <span>{showTextInput ? "Hide" : "Use"} text input option</span>
        <svg
          className={`w-4 h-4 transform transition-transform ${showTextInput ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showTextInput && (
        <div className="space-y-4 mt-4 p-4 border-2 border-dashed border-gray-300 rounded-xl">
          <div className="bg-yellow-50 p-3 rounded-lg mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Both fields below are required when using text input.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conversation Context <span className="text-red-500">*</span>
            </label>
            <textarea
              value={context}
              onChange={(e) => onTextInputChange('context', e.target.value)}
              className={`w-full p-2 border rounded-md transition-colors ${
                showTextInput && !context ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Describe things to help context. Inside jokes, where you met, things they like etc..."
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Their Last Message <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={lastText}
              onChange={(e) => onTextInputChange('lastText', e.target.value)}
              className={`w-full p-2 border rounded-md transition-colors ${
                showTextInput && !lastText ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="What was their last message?"
            />
          </div>

          {showTextInput && (!context || !lastText) && (
            <p className="text-sm text-gray-500 italic">
              Fill out both fields above to proceed
            </p>
          )}
        </div>
      )}
    </div>
  );
}
