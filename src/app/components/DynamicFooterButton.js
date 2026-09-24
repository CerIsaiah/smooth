/**
 * The fixed bottom-bar CTA. Walks the user through the steps: scrolls to the
 * next incomplete step, previews, and finally generates responses. Lifted
 * from the identically-named component that lived inside the original page.js.
 */
export function DynamicFooterButton({
  isGenerating,
  isLoading,
  completedSteps,
  isOnPreview,
  selectedFile,
  context,
  lastText,
  showTextInput,
  onSubmit,
  canAccessStep,
  onScrollToPreview,
}) {
  const scrollToSection = (id) => {
    const element = document.querySelector(id);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });

      if (id === "#step-3") {
        onScrollToPreview();
      }
    }
  };

  // If OpenAI is generating, show loading state regardless of current step
  if (isGenerating) {
    return (
      <button
        disabled
        className="w-full px-6 py-3.5 rounded-full text-white font-medium shadow-lg bg-gray-400 opacity-50 cursor-not-allowed"
      >
        <div className="flex items-center justify-center gap-2">
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span>Generating Responses...</span>
        </div>
      </button>
    );
  }

  // Show generate responses button when on preview section
  if (completedSteps.upload && completedSteps.stage && completedSteps.preview && isOnPreview) {
    return (
      <button
        onClick={onSubmit}
        disabled={isLoading || (!selectedFile && (!context || !lastText))}
        className={`w-full px-6 py-3.5 rounded-full text-white font-medium shadow-lg transition-all
          ${isLoading
            ? 'bg-gray-400'
            : 'hover:scale-[1.02] bg-gradient-to-r from-pink-500 to-rose-500 animate-pulse-scale'}
          disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Generating Responses...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span>Generate Responses</span>
            <span className="text-lg">✨</span>
          </div>
        )}
      </button>
    );
  }

  // All steps completed but not on preview, show preview button
  if (completedSteps.upload && completedSteps.stage && completedSteps.preview) {
    return (
      <button
        onClick={() => scrollToSection("#step-3")}
        className="w-full px-6 py-3.5 rounded-full text-white font-medium shadow-lg transition-all hover:scale-[1.02] bg-gradient-to-r from-pink-500 to-rose-500 animate-pulse-scale"
      >
        See Preview →
      </button>
    );
  }

  if (!completedSteps.upload) {
    const textInputActive = showTextInput && (context || lastText);
    return (
      <button
        onClick={() => scrollToSection("#step-1")}
        className="w-full px-6 py-3.5 rounded-full text-white font-medium shadow-lg transition-all hover:scale-[1.02] bg-gradient-to-r from-pink-500 to-rose-500 animate-pulse-scale"
      >
        {textInputActive ? "Add More Context →" : "Upload Your Screenshot →"}
      </button>
    );
  }

  if (!completedSteps.stage) {
    return (
      <button
        onClick={() => scrollToSection("#step-2")}
        disabled={!canAccessStep(2)}
        className={`w-full px-6 py-3.5 rounded-full text-white font-medium shadow-lg transition-all hover:scale-[1.02]
          ${canAccessStep(2)
            ? "bg-gradient-to-r from-pink-500 to-rose-500 animate-pulse-scale"
            : "bg-gradient-to-r from-gray-400 to-gray-500 opacity-50 cursor-not-allowed hover:scale-100"}`}
      >
        Choose Your Context →
      </button>
    );
  }

  if (!completedSteps.preview) {
    return (
      <button
        onClick={() => scrollToSection("#step-3")}
        disabled={!canAccessStep(3)}
        className={`w-full px-6 py-3.5 rounded-full text-white font-medium shadow-lg transition-all hover:scale-[1.02]
          ${canAccessStep(3)
            ? "bg-gradient-to-r from-pink-500 to-rose-500 animate-pulse-scale"
            : "bg-gradient-to-r from-gray-400 to-gray-500 opacity-50 cursor-not-allowed hover:scale-100"}`}
      >
        Preview Your Message →
      </button>
    );
  }
}
