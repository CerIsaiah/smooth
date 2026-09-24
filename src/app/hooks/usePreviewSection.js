"use client";
import { useEffect, useState } from "react";

/**
 * Tracks whether the preview section (#step-3) is on screen, so the fixed
 * footer button can switch to "Generate Responses" once the user scrolls to it.
 */
export function usePreviewSection() {
  const [isOnPreview, setIsOnPreview] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsOnPreview(true);
          }
        });
      },
      {
        threshold: 0.3, // Trigger when 30% of the element is visible
        rootMargin: '-100px', // Adjust based on your header height
      }
    );

    const previewSection = document.querySelector('#step-3');
    if (previewSection) {
      observer.observe(previewSection);
    }

    return () => {
      if (previewSection) {
        observer.unobserve(previewSection);
      }
    };
  }, []);

  return { isOnPreview, setIsOnPreview };
}
