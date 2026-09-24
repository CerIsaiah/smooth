/**
 * Hero section: headline, product/trust images, and the live "users swiping"
 * indicator (its number is randomized by the useOnlineUsers hook).
 */
export function HeroSection() {
  return (
    <section className="text-center mb-12 sm:mb-16 px-4 sm:px-0 pt-8 sm:pt-12">
      <h1 className="text-5xl sm:text-6xl md:text-6xl font-bold mb-4 sm:mb-6 leading-tight">
        Never Send a <span className="bg-gradient-to-r from-pink-500 to-rose-600 bg-clip-text text-transparent italic">Boring</span> Text Again.
      </h1>
      <p className="text-xl sm:text-1xl text-gray-600 mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed">
        <span className=" bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
        Know Exactly What to Say, When It Matters Most.
        </span>
      </p>
      <div className="relative max-w-[100%] sm:max-w-lg md:max-w-md mx-auto">
        <img
          src="/bigmainpic.png"
          alt="App demonstration"
          className="w-full rounded-2xl"
          loading="lazy"
        />
        <div className="w-full h-px bg-gradient-to-r from-transparent via-pink-200 to-transparent my-8 sm:my-10" />
        <img
          src="/creds.png"
          alt="Trust indicators and credentials"
          className="w-full max-w-[95%] mx-auto"
          loading="lazy"
        />
        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/90 text-white/90 text-sm shadow-lg">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span id="online-users">12 users online</span>
        </div>
      </div>
    </section>
  );
}
