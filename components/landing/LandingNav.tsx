import Link from "next/link";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-[#0f172a]/90 px-6 py-4 backdrop-blur-md">
      <Link href="/" className="text-lg font-extrabold tracking-tight text-white no-underline hover:text-white">
        <span className="text-[#D31145]">AIA</span> Next Gen
      </Link>
      <nav className="flex flex-wrap items-center gap-4 text-sm font-semibold text-slate-200">
        <a href="#pathway" className="no-underline hover:text-white">
          Roadmap
        </a>
        <Link href="/onboarding" className="no-underline hover:text-white">
          Region &amp; chat
        </Link>
        <Link href="/chat" className="no-underline hover:text-white">
          Chat
        </Link>
        <Link href="/login" className="no-underline hover:text-white">
          Sign in
        </Link>
      </nav>
    </header>
  );
}
