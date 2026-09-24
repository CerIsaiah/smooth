/**
 * Step 3 preview pane: shows the uploaded screenshot or the staged text
 * conversation before generation.
 */
export function ConversationPreview({ inputMode, previewUrl, context, lastText }) {
  return (
    <div className="w-full max-w-lg mx-auto min-h-[200px] sm:min-h-[300px] bg-gray-100 rounded-xl p-4">
      {inputMode === 'screenshot' && previewUrl ? (
        <img
          src={previewUrl}
          alt="Preview of uploaded conversation"
          className="w-full max-h-[400px] object-contain rounded-xl"
          loading="lazy"
        />
      ) : inputMode === 'text' && (context || lastText) ? (
        <div className="space-y-4">
          {context && (
            <div className="text-sm text-gray-500 italic mb-4">
              Context: {context}
            </div>
          )}
          {lastText && (
            <div className="flex justify-start">
              <div
                className="bg-gray-200 rounded-2xl p-4 text-gray-800 max-w-[85%] relative"
              >
                {lastText}
                <div
                  className="absolute -left-2 bottom-[45%] w-4 h-4 transform rotate-45 bg-gray-200"
                ></div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="h-full flex items-center justify-center text-gray-400">
          Your conversation will appear here
        </div>
      )}
    </div>
  );
}
