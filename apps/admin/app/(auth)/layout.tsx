export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[var(--sidebar)] text-mist-50 lg:block">
        <svg className="absolute inset-0 size-full opacity-[0.16]" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
          {Array.from({ length: 22 }, (_, i) => (
            <ellipse key={i} cx={420 + Math.sin(i * 0.7) * 30} cy={520} rx={40 + i * 30} ry={26 + i * 19} fill="none" stroke="#8fa994" strokeWidth="1" transform={`rotate(${-12 + i * 1.3} 420 520)`} />
          ))}
        </svg>
        <div className="relative flex h-full flex-col justify-between p-12">
          <p className="flex items-center gap-2.5 text-sm font-semibold tracking-wide">
            <svg viewBox="0 0 40 24" className="h-5 w-9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
              <path d="M1 22 L11 9 L16 14 L24 3 L39 22" />
              <circle cx="30" cy="6" r="2.2" fill="#e0a54b" stroke="none" />
            </svg>
            Reberon Suite
          </p>
          <div>
            <p className="display text-[3.2rem] leading-[1.05]">The House.</p>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-mist-50/70">Website, inbox and first-stay list today. Rates, bookings and the desk as the building opens.</p>
          </div>
          <p className="text-xs text-mist-50/50">
            Kapchorwa · 1,900 m · Technology created and managed by{' '}
            <a href="https://ecadelgroup.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-mist-50/80">
              ECADEL GROUP LIMITED
            </a>
          </p>
        </div>
      </aside>
      <main className="grid place-items-center p-6">
        <div className="w-full max-w-sm fade-in">{children}</div>
      </main>
    </div>
  );
}
