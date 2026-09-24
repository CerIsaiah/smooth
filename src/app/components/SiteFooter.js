/**
 * Simple site footer: Privacy Policy link and copyright.
 */
export function SiteFooter() {
  return (
    <footer className="text-center pb-8">
      <div className="max-w-4xl mx-auto px-4">
        <a href="/privacy-policy" className="px-4 py-2 rounded-full text-gray-600 hover:text-gray-900 transition text-sm md:text-base">
          Privacy Policy
        </a>
        <p className="text-gray-500 text-sm">
          © 2025 Smooth Rizz. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
