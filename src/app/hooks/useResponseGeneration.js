"use client";
import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import { ANONYMOUS_USAGE_LIMIT, FREE_USER_DAILY_LIMIT } from '../constants';
import { analyzeScreenshot } from '../openai';

// Verbose file-to-base64 conversion carried over from page.js (it shadowed the
// thinner convertFileToBase64 in @/utils/usageTracking, so this is what ran).
function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = (error) => {
      reject(error);
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Owns everything about gathering input on the home page (screenshot or text)
 * and generating responses: input state, step tracking, validation, usage-limit
 * checks, and navigation to /responses.
 */
export function useResponseGeneration({ isSignedIn, user, setUsageCount, setShowUpgradePopup, setIsOnPreview }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [context, setContext] = useState('');
  const [lastText, setLastText] = useState('');
  const [inputMode, setInputMode] = useState('screenshot');
  const [completedSteps, setCompletedSteps] = useState({
    upload: false,
    stage: false,
    preview: false
  });

  // Handles file upload with feedback
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Reset states first
      setCompletedSteps({
        upload: false,
        stage: false,
        preview: false
      });
      setMode(null);
      setIsOnPreview(false);

      // Then set the new file
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setInputMode('screenshot');
      setContext('');
      setLastText('');

      // Set upload step as completed after new file is set
      setCompletedSteps(prev => ({ ...prev, upload: true }));
    }
  };

  // Replaces the screenshot with a newly picked one after upload completed
  // (previously an inline onChange handler in the Step 1 card)
  const handleNewScreenshotUpload = (file) => {
    if (!file) return;

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setInputMode('screenshot');

    // Then reset the other states
    setMode(null);
    setIsOnPreview(false);
    setContext('');
    setLastText('');
    setCompletedSteps({
      upload: true, // Keep upload step completed since we have a new file
      stage: false,
      preview: false
    });
  };

  const handlePaste = (event) => {
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          setSelectedFile(file);
          setPreviewUrl(URL.createObjectURL(file));
          setInputMode('screenshot');
          setContext('');
          setLastText('');
          setCompletedSteps(prev => ({ ...prev, upload: true }));
          break;
        }
      }
    }
  };

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handleTextInputChange = (type, value) => {
    if (type === 'context') {
      setContext(value);
    } else {
      setLastText(value);
    }

    if (value) {
      setInputMode('text');
      setSelectedFile(null);
      setPreviewUrl(null);
      // Set upload step as completed if either context or lastText has content
      setCompletedSteps(prev => ({
        ...prev,
        upload: !!(type === 'context' ? value || lastText : value || context)
      }));
    } else {
      // If both inputs are empty, mark upload as incomplete
      const otherFieldEmpty = type === 'context' ? !lastText : !context;
      if (otherFieldEmpty) {
        setCompletedSteps(prev => ({
          ...prev,
          upload: false
        }));
      }
    }
  };

  const handleModeSelection = (selectedMode) => {
    setMode(selectedMode);
    setCompletedSteps(prev => ({ ...prev, stage: true }));
  };

  const canAccessStep = (stepNumber) => {
    switch (stepNumber) {
      case 1: // Upload
        return true; // Always accessible
      case 2: // Stage
        return completedSteps.upload;
      case 3: // Preview
        return completedSteps.upload && completedSteps.stage;
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile && (!context || !lastText)) {
      console.warn('Missing required input');
      alert("Please select a screenshot or provide text input");
      return;
    }

    try {
      setIsGenerating(true);
      localStorage.removeItem('current_responses');

      // Check usage status before proceeding
      const statusResponse = await fetch('/api/usage', {
        headers: {
          'Content-Type': 'application/json',
          ...(isSignedIn && user?.email && { 'x-user-email': user.email }),
        },
      });

      const statusData = await statusResponse.json();

      // For anonymous users at limit, show sign in overlay (it renders from the
      // usageCount >= ANONYMOUS_USAGE_LIMIT condition below)
      if (!isSignedIn && statusData.dailySwipes >= ANONYMOUS_USAGE_LIMIT) {
        setUsageCount(ANONYMOUS_USAGE_LIMIT);
        return;
      }

      // For signed-in users at limit, show upgrade popup
      if (isSignedIn && !statusData.isPremium && statusData.dailySwipes >= FREE_USER_DAILY_LIMIT) {
        setShowUpgradePopup(true);
        return;
      }

      setIsLoading(true);

      // Generate responses using OpenAI
      const responses = await analyzeScreenshot(
        selectedFile,
        mode,
        isSignedIn,
        context,
        lastText
      );

      // Validate responses
      if (!Array.isArray(responses) || responses.length === 0) {
        throw new Error('Invalid response format received');
      }

      // Save new responses with error handling
      try {
        const responseData = {
          responses,
          currentIndex: responses.length - 1,
          mode,
          lastContext: context,
          lastText,
          inputMode: selectedFile ? 'screenshot' : 'text',
          timestamp: Date.now()
        };

        if (selectedFile) {
          const base64File = await convertFileToBase64(selectedFile);
          responseData.lastFile = base64File;
        }

        localStorage.setItem('current_responses', JSON.stringify(responseData));

        // Verify the save was successful
        const savedData = localStorage.getItem('current_responses');
        if (!savedData) {
          throw new Error('Verification failed: Data not found in localStorage after save');
        }

        router.push('/responses');

      } catch (storageError) {
        throw new Error('Failed to save responses. Please try again.');
      }

    } catch (error) {
      // More specific error messages
      if (error.message.includes('usage limit')) {
        alert("You've reached your usage limit. Please try again later.");
      } else if (error.message.includes('Invalid response')) {
        alert("Received invalid response from server. Please try again.");
      } else if (error.message.includes('Failed to save')) {
        alert("Failed to save responses. Please try again.");
      } else {
        alert("Error processing input. Please try again.");
      }

    } finally {
      setIsGenerating(false);
      setIsLoading(false);
    }
  };

  // Mark the preview step complete once input exists
  useEffect(() => {
    if (selectedFile || (context && lastText)) {
      setCompletedSteps(prev => ({ ...prev, preview: true }));
    }
  }, [selectedFile, context, lastText]);

  return {
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
  };
}
