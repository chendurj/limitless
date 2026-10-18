import Link from "next/link";
import { AskAnything } from "@/components/AskAnything";
import { DEMO_TRIPS } from "@/lib/api";

export default function Home() {
  return (
    <section
      className="relative flex min-h-screen flex-col overflow-hidden bg-[#070b10] bg-cover bg-center"
      style={{ backgroundImage: "url('/logo-bg-poster.jpg')" }}
    >
      {/* Looping infinity logo. Hidden when the viewer prefers reduced motion;
          the poster image on the section stays as a still fallback. */}
      <video
        autoPlay
        muted
        loop
        playsInline
        poster="/logo-bg-poster.jpg"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-2xl motion-reduce:hidden"
      >
        <source src="/logo-bg.mp4" type="video/mp4" />
      </video>
      <div aria-hidden="true" className="absolute inset-0 bg-[#070b10]/70" />

      <nav
        aria-label="Main"
        className="relative z-10 flex w-full flex-wrap items-center justify-center gap-6 px-6 pt-6 text-sm font-medium"
      >
        <Link href="/how-it-works" className="text-zinc-200 hover:text-white">
          How it works
        </Link>
        <Link href="/reviews" className="text-zinc-200 hover:text-white">
          Reviews
        </Link>
        <Link href="/features" className="text-zinc-200 hover:text-white">
          Features
        </Link>
        <Link href="/my-trips" className="rounded-full border border-teal-300/40 px-5 py-2 text-teal-300 transition-colors hover:bg-teal-300/10 hover:text-white">
          My trips
        </Link>
      </nav>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <h1
          className="font-extrabold leading-none tracking-tight"
          style={{ fontSize: "clamp(3.5rem, 12vw, 11rem)" }}
        >
          <span className="bg-gradient-to-r from-teal-200 via-teal-300 to-sky-400 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(45,212,191,0.4)]">
            limitless.
          </span>
        </h1>
        <p className="mt-5 text-lg text-zinc-200 sm:text-xl">
          Your world to discover. Your right to explore.
        </p>

        <Link
          href="/intake"
          className="mt-10 inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary-hover"
        >
          Plan your trip
        </Link>

        <AskAnything />

        <p className="mt-6 text-sm">
          <Link
            href={`/trips/${DEMO_TRIPS.deaf}`}
            className="text-teal-300 underline underline-offset-4"
          >
            See a sample itinerary
          </Link>
        </p>
      </div>
    </section>
  );
}
