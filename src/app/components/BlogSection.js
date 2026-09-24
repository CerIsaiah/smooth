import Link from "next/link";
import Image from "next/image";

/**
 * "Learn From Our Experts" SEO section with the two blog links.
 */
export function BlogSection() {
  return (
    <section className="mt-16 sm:mt-24 px-4 sm:px-0 mb-24 sm:mb-16">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-pink-50/80 via-white to-rose-50/80 rounded-xl shadow-sm overflow-hidden border border-pink-100">
          <div className="p-6 sm:p-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
              Learn From Our Experts
            </h2>
            <div className="grid sm:grid-cols-2 gap-8">
              <Link
                href="/blog/how-to-rizz-techniques-that-actually-work"
                className="group block overflow-hidden rounded-xl hover:shadow-lg transition-shadow bg-white"
              >
                <div className="relative w-full h-48">
                  <Image
                    src="/pics/thumbs-up.png"
                    alt="Modern messaging techniques guide"
                    fill
                    className="object-cover transform group-hover:scale-105 transition-transform duration-300"
                    priority
                  />
                </div>
                <div className="p-4 bg-gradient-to-r from-pink-50/50 to-rose-50/50">
                  <h3 className="font-semibold text-lg group-hover:text-pink-500 transition-colors">
                    How to Rizz: Techniques That You Can Use in 2025
                  </h3>
                  <p className="text-gray-600 mt-2 text-sm">
                    Learn proven techniques to improve your messaging game and build better connections.
                  </p>
                </div>
              </Link>

              <Link
                href="/blog/best-rizz-lines-100-plus-examples-that-actually-work"
                className="group block overflow-hidden rounded-xl hover:shadow-lg transition-shadow bg-white"
              >
                <div className="relative w-full h-48">
                  <Image
                    src="/pics/percent100.png"
                    alt="Best rizz lines guide"
                    fill
                    className="object-cover transform group-hover:scale-105 transition-transform duration-300"
                    priority
                  />
                </div>
                <div className="p-4 bg-gradient-to-r from-pink-50/50 to-rose-50/50">
                  <h3 className="font-semibold text-lg group-hover:text-pink-500 transition-colors">
                    Best Rizz Lines: 100+ Examples That Work
                  </h3>
                  <p className="text-gray-600 mt-2 text-sm">
                    Rizz Pick up Lines That Work in 2025
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
