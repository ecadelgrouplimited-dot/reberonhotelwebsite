'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/cn';

export interface SipiConciergeOrbProps {
  /** Preset size of the icon */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Extra classes for the outer wrapper */
  className?: string;
  /** Intensifies the blinking beacon & wave speed (e.g. when AI is thinking, speaking, or hovered) */
  active?: boolean;
  /** Whether to show an external corner live badge dot in addition to the internal blinking ring */
  showCornerPulse?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<SipiConciergeOrbProps['size']>, string> = {
  xs: 'size-5 rounded-md',
  sm: 'size-8 rounded-lg',
  md: 'size-11 rounded-xl',
  lg: 'size-14 rounded-2xl',
  xl: 'size-20 rounded-3xl',
};

/**
 * Lively, interactive, blinking Sipi Concierge icon inspired by Sipi Falls & Mount Elgon:
 * - Deep basalt sanctuary canvas (#09110e) with a warm-gold to highland-emerald glowing frame
 * - Animated flowing golden & emerald waterfall/contour ribbons
 * - Twinkling golden stardust particles
 * - Interactive blinking concentric emerald beacon in the upper-right quadrant
 */
export function SipiConciergeOrb({
  size = 'md',
  className,
  active = false,
  showCornerPulse = false,
}: SipiConciergeOrbProps) {
  const uid = useId().replace(/:/g, '');

  return (
    <span
      className={cn(
        'group/orb relative inline-flex shrink-0 items-center justify-center overflow-hidden select-none',
        'bg-[#08100d] shadow-[0_0_24px_-4px_rgba(245,158,11,0.35),0_0_20px_-4px_rgba(16,185,129,0.3)]',
        'transition-transform duration-300',
        SIZE_CLASSES[size],
        className,
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <defs>
          {/* Deep Highland Night Background */}
          <radialGradient id={`bg-${uid}`} cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#11221c" />
            <stop offset="55%" stopColor="#0a1410" />
            <stop offset="100%" stopColor="#050a08" />
          </radialGradient>

          {/* Outer Squircle Border Gradient (Gold bottom-left -> Emerald top-right) */}
          <linearGradient id={`border-${uid}`} x1="8%" y1="92%" x2="92%" y2="8%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="45%" stopColor="#fbbf24" />
            <stop offset="75%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>

          {/* Luminous Gold Stream Gradient */}
          <linearGradient id={`gold-stream-${uid}`} x1="0%" y1="15%" x2="95%" y2="90%">
            <stop offset="0%" stopColor="#b45309" stopOpacity="0.6" />
            <stop offset="28%" stopColor="#f59e0b" />
            <stop offset="52%" stopColor="#fef08a" />
            <stop offset="78%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="0.4" />
          </linearGradient>

          {/* Warm Amber Ribbon Gradient */}
          <linearGradient id={`amber-stream-${uid}`} x1="0%" y1="40%" x2="85%" y2="95%">
            <stop offset="0%" stopColor="#92400e" stopOpacity="0.4" />
            <stop offset="40%" stopColor="#f59e0b" stopOpacity="0.95" />
            <stop offset="70%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#78350f" stopOpacity="0.2" />
          </linearGradient>

          {/* Highland Emerald Stream Gradient */}
          <linearGradient id={`emerald-stream-${uid}`} x1="10%" y1="15%" x2="95%" y2="85%">
            <stop offset="0%" stopColor="#065f46" stopOpacity="0.3" />
            <stop offset="35%" stopColor="#10b981" stopOpacity="0.95" />
            <stop offset="62%" stopColor="#a7f3d0" />
            <stop offset="85%" stopColor="#059669" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#064e3b" stopOpacity="0.25" />
          </linearGradient>

          {/* Beacon Core Glow */}
          <radialGradient id={`beacon-glow-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#10b981" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0" />
          </radialGradient>

          {/* Soft Glow Filter */}
          <filter id={`glow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background Canvas */}
        <rect x="2" y="2" width="96" height="96" rx="22" fill={`url(#bg-${uid})`} />

        {/* Ambient Gold & Emerald Backlights */}
        <circle cx="34" cy="56" r="28" fill="#f59e0b" fillOpacity="0.12" />
        <circle cx="72" cy="28" r="22" fill="#10b981" fillOpacity="0.16" />

        {/* ── FLOWING SIPI FALLS & HIGHLAND CONTOUR RIBBONS ── */}
        <g filter={`url(#glow-${uid})`}>
          {/* Outer Emerald Contour Wave (Upper-Right Flow) */}
          <path
            d="M -4 22 C 26 16, 44 20, 56 38 C 68 56, 82 36, 104 42"
            stroke={`url(#emerald-stream-${uid})`}
            strokeWidth="4.5"
            strokeLinecap="round"
          >
            <animate
              attributeName="d"
              dur={active ? '2.4s' : '4.8s'}
              repeatCount="indefinite"
              values="
                M -4 22 C 26 16, 44 20, 56 38 C 68 56, 82 36, 104 42;
                M -4 24 C 24 19, 46 17, 58 35 C 70 53, 84 40, 104 39;
                M -4 22 C 26 16, 44 20, 56 38 C 68 56, 82 36, 104 42
              "
            />
          </path>

          {/* Secondary Emerald Cascade */}
          <path
            d="M 18 102 C 22 76, 38 66, 56 58 C 72 50, 70 80, 62 102"
            stroke={`url(#emerald-stream-${uid})`}
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.9"
          >
            <animate
              attributeName="d"
              dur={active ? '2.6s' : '5.2s'}
              repeatCount="indefinite"
              values="
                M 18 102 C 22 76, 38 66, 56 58 C 72 50, 70 80, 62 102;
                M 21 102 C 25 74, 41 64, 59 56 C 75 48, 67 82, 59 102;
                M 18 102 C 22 76, 38 66, 56 58 C 72 50, 70 80, 62 102
              "
            />
          </path>

          {/* Deep Amber Lower Swirl */}
          <path
            d="M -4 80 C 14 62, 42 66, 46 54 C 50 44, 24 38, -4 28"
            stroke={`url(#amber-stream-${uid})`}
            strokeWidth="6.5"
            strokeLinecap="round"
          />

          {/* Main Luminous Gold S-Curve Waterfall */}
          <path
            d="M -4 18 C 28 18, 36 52, 52 54 C 70 56, 76 74, 68 102"
            stroke={`url(#gold-stream-${uid})`}
            strokeWidth="7.5"
            strokeLinecap="round"
          >
            <animate
              attributeName="d"
              dur={active ? '2.2s' : '4.4s'}
              repeatCount="indefinite"
              values="
                M -4 18 C 28 18, 36 52, 52 54 C 70 56, 76 74, 68 102;
                M -4 16 C 31 20, 34 50, 54 52 C 72 54, 74 76, 65 102;
                M -4 18 C 28 18, 36 52, 52 54 C 70 56, 76 74, 68 102
              "
            />
          </path>

          {/* Shimmering White-Gold Crest Highlight */}
          <path
            d="M 4 21 C 28 24, 38 49, 53 53 C 66 57, 42 74, 28 98"
            stroke="#fef9c3"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="18 10"
            opacity="0.92"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="56"
              to="0"
              dur={active ? '1.4s' : '2.8s'}
              repeatCount="indefinite"
            />
          </path>

          {/* Shimmering Mint-Emerald Crest Highlight */}
          <path
            d="M 22 23 C 42 25, 46 47, 60 53 C 74 59, 82 72, 76 98"
            stroke="#a7f3d0"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray="14 12"
            opacity="0.88"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="-52"
              dur={active ? '1.6s' : '3.2s'}
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* ── TWINKLING STARDUST PARTICLES ── */}
        <g>
          <circle cx="22" cy="16" r="1.6" fill="#fde047">
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle cx="36" cy="20" r="1.3" fill="#fef08a">
            <animate attributeName="opacity" values="0.9;0.2;0.9" dur="2.3s" repeatCount="indefinite" />
          </circle>
          <circle cx="24" cy="48" r="1.8" fill="#fbbf24">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="16" cy="72" r="1.5" fill="#fde047">
            <animate attributeName="opacity" values="1;0.25;1" dur="2.1s" repeatCount="indefinite" />
          </circle>
          <circle cx="48" cy="36" r="1.5" fill="#6ee7b7">
            <animate attributeName="opacity" values="0.2;0.95;0.2" dur="1.9s" repeatCount="indefinite" />
          </circle>
          <circle cx="62" cy="68" r="1.7" fill="#34d399">
            <animate attributeName="opacity" values="0.85;0.15;0.85" dur="1.7s" repeatCount="indefinite" />
          </circle>
          <circle cx="76" cy="60" r="1.6" fill="#fde047">
            <animate attributeName="opacity" values="0.25;1;0.25" dur="2.0s" repeatCount="indefinite" />
          </circle>
          <circle cx="38" cy="84" r="1.4" fill="#6ee7b7">
            <animate attributeName="opacity" values="0.9;0.2;0.9" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* ── INTERACTIVE BLINKING EMERALD BEACON ORB (TOP-RIGHT) ── */}
        <g transform="translate(72, 26)">
          {/* Ambient radial halo */}
          <circle cx="0" cy="0" r="18" fill={`url(#beacon-glow-${uid})`}>
            <animate
              attributeName="r"
              values="15;20;15"
              dur={active ? '1.1s' : '2.2s'}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.55;0.95;0.55"
              dur={active ? '1.1s' : '2.2s'}
              repeatCount="indefinite"
            />
          </circle>

          {/* Expanding Radar Ripple Ring 1 */}
          <circle
            cx="0"
            cy="0"
            r="9"
            stroke="#34d399"
            strokeWidth="1.3"
            fill="none"
          >
            <animate
              attributeName="r"
              values="8;17"
              dur={active ? '1.2s' : '2.1s'}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.85;0"
              dur={active ? '1.2s' : '2.1s'}
              repeatCount="indefinite"
            />
          </circle>

          {/* Expanding Radar Ripple Ring 2 (Staggered) */}
          <circle
            cx="0"
            cy="0"
            r="9"
            stroke="#6ee7b7"
            strokeWidth="1"
            fill="none"
          >
            <animate
              attributeName="r"
              values="8;19"
              dur={active ? '1.2s' : '2.1s'}
              begin="0.9s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.65;0"
              dur={active ? '1.2s' : '2.1s'}
              begin="0.9s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Static Precision Outer Ring */}
          <circle
            cx="0"
            cy="0"
            r="12.5"
            stroke="#10b981"
            strokeOpacity="0.45"
            strokeWidth="1"
            fill="none"
          />

          {/* Blinking Luminous Emerald Core Ring (Matches Demo Image) */}
          <circle
            cx="0"
            cy="0"
            r="8.2"
            fill="#064e3b"
            fillOpacity="0.65"
            stroke="#6ee7b7"
            strokeWidth="2.8"
          >
            <animate
              attributeName="stroke"
              values="#6ee7b7;#a7f3d0;#10b981;#6ee7b7"
              dur={active ? '0.9s' : '1.8s'}
              repeatCount="indefinite"
            />
            <animate
              attributeName="stroke-width"
              values="2.5;3.4;2.5"
              dur={active ? '0.9s' : '1.8s'}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="1;0.45;1;0.9;1"
              dur={active ? '1.2s' : '2.6s'}
              repeatCount="indefinite"
            />
          </circle>
        </g>

        {/* Glowing Gold-to-Emerald Squircle Frame */}
        <rect
          x="2"
          y="2"
          width="96"
          height="96"
          rx="22"
          stroke={`url(#border-${uid})`}
          strokeWidth="3"
          fill="none"
        />
      </svg>

      {showCornerPulse && (
        <span className="pointer-events-none absolute top-1 right-1 flex size-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-80" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
        </span>
      )}
    </span>
  );
}
