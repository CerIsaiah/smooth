"use client";
import React from "react";
import Script from "next/script";
import { loadStripe } from '@stripe/stripe-js';
import { ANONYMOUS_USAGE_LIMIT } from './constants';
import { useRouter } from 'next/navigation';
import { UpgradePopup } from './components/UpgradePopup';
import { GoogleSignInOverlay } from './components/GoogleSignInOverlay';
import { SeoHead } from './components/SeoHead';
import { Header } from './components/Header';
import { TrialBanner } from './components/TrialBanner';
import { HeroSection } from './components/HeroSection';
import { StepUploadCard } from './components/StepUploadCard';
import { StepContextCard } from './components/StepContextCard';
import { StepPreviewCard } from './components/StepPreviewCard';
import { ConversationPreview } from './components/ConversationPreview';
import { TextInputSection } from './components/TextInputSection';
import { BlogSection } from './components/BlogSection';
import { SiteFooter } from './components/SiteFooter';
import { DynamicFooterButton } from './components/DynamicFooterButton';
import { SwipeStyles } from './components/SwipeStyles';
import { useGoogleAuth } from './hooks/useGoogleAuth';
import { useUsage } from './hooks/useUsage';
import { useResponseGeneration } from './hooks/useResponseGeneration';
import { usePreviewSection } from './hooks/usePreviewSection';
import { useStripeCheckout } from './hooks/useStripeCheckout';
import { useOnlineUsers } from './hooks/useOnlineUsers';

// Make sure to call `loadStripe` outside of a component's render
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

export default function Home() {
  const router = useRouter();

  // Google Identity Services: session restore, header button, sign-in callback
  const { isSignedIn, user, googleLoaded, googleButtonRef, handleOverlaySignInSuccess } = useGoogleAuth();

  // Usage counters, premium/trial status, upgrade popup
  const { usageCount, setUsageCount, isPremium, showUpgradePopup, setShowUpgradePopup } = useUsage(isSignedIn, user);

  // Whether the preview card (#step-3) is on screen
  const { isOnPreview, setIsOnPreview } = usePreviewSection();

  // Conversation input + response generation
  const {
    isLoading,
    isGenerating,
    mode,
    selectedFile,
    previewUrl,
    showTextInput,
    setShowTextInput,
    context,
    lastText,
    inputMode,
    completedSteps,
    canAccessStep,
    handleFileUpload,
    handleNewScreenshotUpload,
    handleTextInputChange,
    handleModeSelection,
    handleSubmit
  } = useResponseGeneration({ isSignedIn, user, setUsageCount, setShowUpgradePopup, setIsOnPreview });

  // Trial checkout + Stripe redirect-back handling
  const { handleCheckout } = useStripeCheckout({ isSignedIn, user, setUsageCount });

  // Cosmetic "N users swiping" indicator in the hero
  useOnlineUsers();

  return (
    <>
      <SwipeStyles />

      <SeoHead asPath={router.asPath} />

      <Script
        id="google-tag-manager"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-KMCKVJ4H');
          `
        }}
      />

      <div className="min-h-screen bg-[#fbfbfb]">
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KMCKVJ4H"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>

        {/* Header - Professional & Responsive */}
        <Header isSignedIn={isSignedIn} googleButtonRef={googleButtonRef} />

        {/* Add this right after the header, before the main content */}
        <TrialBanner onCheckout={handleCheckout} />

        <main className="px-4 md:px-6 lg:px-8 max-w-7xl mx-auto pb-24">
          {/* Hero Section - Enhanced */}
          <HeroSection />

          {/* Steps Section - Professional Cards */}
          <section className="space-y-12 sm:space-y-16 px-4 sm:px-0 max-w-3xl mx-auto">
            {/* Step 1 - Upload */}
            <StepUploadCard
              completed={completedSteps.upload}
              onFileUpload={handleFileUpload}
              onNewScreenshot={handleNewScreenshotUpload}
            >
              <TextInputSection
                showTextInput={showTextInput}
                onToggle={() => setShowTextInput(!showTextInput)}
                context={context}
                lastText={lastText}
                onTextInputChange={handleTextInputChange}
              />
            </StepUploadCard>

            {/* Step 2 - Stage Selection */}
            <StepContextCard mode={mode} onModeSelection={handleModeSelection} />

            {/* Step 3 - Preview */}
            <StepPreviewCard>
              <ConversationPreview
                inputMode={inputMode}
                previewUrl={previewUrl}
                context={context}
                lastText={lastText}
              />
            </StepPreviewCard>
          </section>

          <div className="border-t border-gray-200 my-16"></div>

          {/* SEO Section - Updated with Blog Links */}
          <BlogSection />

          <SiteFooter />

          {/* Dynamic Footer */}
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-pink-100 p-4 z-40">
            <div className="max-w-3xl mx-auto">
              <DynamicFooterButton
                isGenerating={isGenerating}
                isLoading={isLoading}
                completedSteps={completedSteps}
                isOnPreview={isOnPreview}
                selectedFile={selectedFile}
                context={context}
                lastText={lastText}
                showTextInput={showTextInput}
                onSubmit={handleSubmit}
                canAccessStep={canAccessStep}
                onScrollToPreview={() => setIsOnPreview(true)}
              />
            </div>
          </div>

          {/* Add the upgrade popup */}
          {showUpgradePopup && !isPremium && (
            <UpgradePopup
              onClose={() => setShowUpgradePopup(false)}
              handleCheckout={handleCheckout}
            />
          )}

          {/* Google Sign-In Overlay */}
          {!isSignedIn && usageCount >= ANONYMOUS_USAGE_LIMIT && (
            <GoogleSignInOverlay googleLoaded={googleLoaded} onSignInSuccess={handleOverlaySignInSuccess} />
          )}
        </main>
      </div>
    </>
  );
}
