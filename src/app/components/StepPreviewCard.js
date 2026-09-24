/**
 * Step 3 card shell; the ConversationPreview element is passed as children.
 */
export function StepPreviewCard({ children }) {
  return (
    <div id="step-3" className="bg-white rounded-xl shadow-lg border border-gray-100 transform transition-all hover:scale-[1.01] hover:shadow-xl">
      <div className="p-4 sm:p-5 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-rose-50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center">
            <span className="text-xl font-semibold text-pink-500">3</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Preview</h2>
        </div>
      </div>

      <div className="p-4">
        {children}
      </div>
    </div>
  );
}
