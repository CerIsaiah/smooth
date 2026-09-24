/**
 * Swipe-card stylesheet, lifted verbatim from the `styles` const in the
 * original page.js (the classes are consumed by the /responses swipe UI,
 * which reads them from the globally rendered style tag).
 */
const swipeStyles = `
  .swipe {
    position: absolute;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .card {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    transition: transform 0.2s ease;
    cursor: grab;
  }

  .card:active {
    cursor: grabbing;
  }

  .card-content {
    font-size: 1rem;
    line-height: 1.5;
    text-align: center;
    font-weight: 500;
    color: #1a1a1a;
    padding: 1rem 1.25rem;
    margin: 0 auto;
    width: 90%;
  }

  @media (min-width: 640px) {
    .card-content {
      font-size: 1.125rem;
      padding: 1.25rem 1.5rem;
    }
  }

  @media (min-width: 768px) {
    .card-content {
      font-size: 1.25rem;
      padding: 1.5rem 1.75rem;
    }
  }

  .swipe-indicator {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .swipe-indicator.left {
    left: 0.75rem;
  }

  .swipe-indicator.right {
    right: 0.75rem;
  }

  .swipe-indicator .icon {
    font-size: 1rem;
    margin-bottom: 0.25rem;
  }

  .swipe-indicator .text {
    font-size: 0.75rem;
    font-weight: 500;
    color: #666;
  }

  .card:hover .swipe-indicator {
    opacity: 0.9;
  }

  .card-number {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    color: #666;
  }

  @keyframes pulse-scale {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.03);
    }
  }

  .animate-pulse-scale {
    animation: pulse-scale 3s ease-in-out infinite;
  }

  @keyframes pulse-fade {
    0%, 100% {
      opacity: 1;
      transform: scale(1.2);
    }
    50% {
      opacity: 0.4;
      transform: scale(1);
    }
  }

  .animate-pulse-fade {
    animation: pulse-fade 1.2s ease-in-out infinite;
    text-shadow: 0 0 20px rgba(254, 60, 114, 0.7),
                 0 0 40px rgba(254, 60, 114, 0.4);
  }
`;

export function SwipeStyles() {
  return <style jsx global>{swipeStyles}</style>;
}
