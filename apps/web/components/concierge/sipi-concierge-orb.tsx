'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/cn';

const MONOGRAM_PATHS = [
  'M 291.980469 154.832031 C 317.710938 156.78125 334.457031 187.140625 334.457031 216.847656 L 348.960938 216.847656 C 348.960938 163.941406 303.910156 158.609375 297.710938 150.070312 L 286.855469 150.070312 C 287.464844 152.484375 289.21875 154.550781 291.980469 154.832031 ',
  'M 273.332031 75.683594 L 299.234375 75.683594 C 315.636719 75.683594 325.996094 86.527344 325.996094 109.511719 C 325.996094 132.496094 300.613281 139 290.773438 142.039062 C 289.527344 142.429688 288.585938 143.160156 287.910156 144.066406 L 299 144.066406 C 307.558594 136.039062 340.675781 133.546875 340.675781 104.089844 C 340.675781 78.71875 322.199219 73.300781 299.578125 73.300781 L 256.410156 73.300781 C 256.238281 73.515625 256.238281 73.515625 256.238281 73.949219 C 259 75.683594 259 81.757812 259 86.527344 L 259 144.066406 L 273.332031 144.066406 Z M 273.332031 75.683594 ',
  'M 259.003906 203.621094 C 259.003906 208.175781 259.003906 214.246094 256.242188 216.195312 L 256.414062 216.847656 L 275.921875 216.847656 L 276.097656 216.195312 C 273.332031 214.246094 273.332031 208.175781 273.332031 203.621094 L 273.332031 150.070312 L 259.003906 150.070312 Z M 259.003906 203.621094 ',
  'M 373.617188 209.238281 C 373.796875 209.417969 373.796875 209.773438 373.441406 209.773438 L 353.164062 209.773438 C 352.808594 209.773438 352.808594 209.417969 352.988281 209.238281 C 355.859375 207.621094 355.859375 202.597656 355.859375 198.832031 L 355.859375 148.234375 L 239.941406 148.234375 L 239.941406 198.832031 C 239.941406 202.597656 239.941406 207.621094 242.632812 209.238281 C 242.992188 209.417969 242.992188 209.773438 242.632812 209.773438 L 222.179688 209.773438 C 222 209.773438 221.820312 209.417969 222.179688 209.238281 C 225.050781 207.621094 225.050781 202.597656 225.050781 198.832031 L 225.050781 101.945312 C 225.050781 98 225.050781 92.976562 222.179688 91.539062 C 221.820312 91.359375 222 91 222.179688 91 L 242.632812 91 C 242.992188 91 242.992188 91.359375 242.632812 91.539062 C 239.941406 92.976562 239.941406 98 239.941406 101.945312 L 239.941406 145.902344 L 355.859375 145.902344 L 355.859375 101.945312 C 355.859375 98 355.859375 92.976562 352.988281 91.539062 C 352.808594 91.359375 352.808594 91 353.164062 91 L 373.441406 91 C 373.796875 91 373.796875 91.359375 373.617188 91.539062 C 370.75 92.976562 370.75 98 370.75 101.945312 L 370.75 198.832031 C 370.75 202.597656 370.75 207.621094 373.617188 209.238281 '
];

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
 * Official Reberon Hotel Sipi Concierge Emblem:
 * - Royal Navy (#1A1E43 / #0E1126) canvas with Burnt Copper (#D76E1B) & Warm Amber (#E88432) glowing frame
 * - Official RH Copper Monogram at the center
 * - Animated contour waves & live beacon
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
        'bg-[#1A1E43] shadow-[0_0_24px_-4px_rgba(215,110,27,0.45),0_0_20px_-4px_rgba(26,30,67,0.6)]',
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
          {/* Deep Royal Navy Background */}
          <radialGradient id={`bg-${uid}`} cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#242957" />
            <stop offset="55%" stopColor="#1A1E43" />
            <stop offset="100%" stopColor="#0E1126" />
          </radialGradient>

          {/* Outer Squircle Border Gradient (Brand Copper -> Platinum/Amber) */}
          <linearGradient id={`border-${uid}`} x1="8%" y1="92%" x2="92%" y2="8%">
            <stop offset="0%" stopColor="#D76E1B" />
            <stop offset="50%" stopColor="#E88432" />
            <stop offset="80%" stopColor="#FAD7B8" />
            <stop offset="100%" stopColor="#D76E1B" />
          </linearGradient>

          {/* Subtle Contour Wave Gradient */}
          <linearGradient id={`copper-stream-${uid}`} x1="0%" y1="15%" x2="95%" y2="90%">
            <stop offset="0%" stopColor="#D76E1B" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#E88432" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#D76E1B" stopOpacity="0.1" />
          </linearGradient>

          {/* Beacon Core Glow */}
          <radialGradient id={`beacon-glow-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FAD7B8" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#D76E1B" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#1A1E43" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Background Canvas */}
        <rect x="2" y="2" width="96" height="96" rx="22" fill={`url(#bg-${uid})`} />

        {/* Ambient Copper Backlight */}
        <circle cx="50" cy="52" r="32" fill="#D76E1B" fillOpacity="0.14" />

        {/* Subtle Animated Highland Contour Waves */}
        <path
          d="M -4 26 C 26 18, 44 24, 58 38 C 72 52, 84 36, 104 42"
          stroke={`url(#copper-stream-${uid})`}
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <animate
            attributeName="d"
            dur={active ? '2.4s' : '4.8s'}
            repeatCount="indefinite"
            values="
              M -4 26 C 26 18, 44 24, 58 38 C 72 52, 84 36, 104 42;
              M -4 28 C 24 22, 46 20, 60 35 C 74 50, 86 40, 104 39;
              M -4 26 C 26 18, 44 24, 58 38 C 72 52, 84 36, 104 42
            "
          />
        </path>

        <path
          d="M -4 78 C 24 68, 42 74, 58 62 C 74 50, 86 68, 104 64"
          stroke={`url(#copper-stream-${uid})`}
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Official Reberon Hotel RH Copper Monogram Centered in 100x100 */}
        <g transform="translate(50, 52) scale(0.42) translate(-297.8, -145.05)">
          {MONOGRAM_PATHS.map((d, i) => (
            <path key={i} d={d} fill="#D76E1B" fillRule="nonzero" />
          ))}
        </g>

        {/* Live Blinking Copper Beacon (Top-Right) */}
        <g transform="translate(79, 21)">
          <circle cx="0" cy="0" r="10" fill={`url(#beacon-glow-${uid})`}>
            <animate
              attributeName="r"
              values="8;13;8"
              dur={active ? '1.1s' : '2.2s'}
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="0" cy="0" r="5" stroke="#E88432" strokeWidth="1.2" fill="none">
            <animate
              attributeName="r"
              values="4;11"
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
          <circle
            cx="0"
            cy="0"
            r="3.8"
            fill="#D76E1B"
            stroke="#FAD7B8"
            strokeWidth="1.5"
          />
        </g>

        {/* Glowing Brand Copper Squircle Frame */}
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
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E88432] opacity-80" />
          <span className="relative inline-flex size-2.5 rounded-full bg-[#D76E1B] shadow-[0_0_8px_#D76E1B]" />
        </span>
      )}
    </span>
  );
}
