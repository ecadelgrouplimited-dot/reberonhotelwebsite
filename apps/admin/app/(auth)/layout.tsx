import { ReberonHorizontalLogo, ReberonStackedLogo } from '@/components/shell/brand-logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#1A1E43] text-white lg:block">
        <svg className="absolute inset-0 size-full opacity-[0.14]" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
          {Array.from({ length: 22 }, (_, i) => (
            <ellipse
              key={i}
              cx={420 + Math.sin(i * 0.7) * 30}
              cy={520}
              rx={40 + i * 30}
              ry={26 + i * 19}
              fill="none"
              stroke="#D76E1B"
              strokeWidth="1"
              transform={`rotate(${-12 + i * 1.3} 420 520)`}
            />
          ))}
        </svg>
        <div className="relative flex h-full flex-col justify-between p-12">
          <div>
            <ReberonHorizontalLogo className="h-12 w-auto" wordmarkColor="#FFFFFF" copperColor="#D76E1B" />
          </div>
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#D76E1B]/40 bg-[#D76E1B]/15 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#E88432]">
              The House · Staff &amp; Operations Suite
            </div>
            <p className="display text-[3.1rem] leading-[1.06] text-white">
              Stay In Comfort,
              <br />
              <span className="text-[#E88432]">Leave With Memories.</span>
            </p>
            <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-white/75">
              Unified Property Management, Front Desk, Reservations, POS, Housekeeping, Human Resources, and Finance for Reberon Hotel Kapchorwa.
            </p>
          </div>
          <p className="text-xs text-white/55">
            Kapchorwa · 1,900 m · Technology created and managed by{' '}
            <a href="https://ecadelgroup.com" target="_blank" rel="noopener noreferrer" className="text-[#E88432] underline underline-offset-2 hover:text-white">
              ECADEL GROUP LIMITED
            </a>
          </p>
        </div>
      </aside>
      <main className="grid place-items-center bg-[var(--bg)] p-6">
        <div className="w-full max-w-sm fade-in">
          <div className="mb-6 flex justify-center lg:hidden">
            <ReberonStackedLogo className="h-20 w-auto" wordmarkColor="var(--fg)" copperColor="#D76E1B" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
