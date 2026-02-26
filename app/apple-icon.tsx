import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0812', borderRadius: 40 }}>
        <svg width="110" height="110" viewBox="0 0 32 32">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          <path d="M16 27L4 15L4 10L10 4L16 10L22 4L28 10L28 15Z"
                fill="none" stroke="url(#g)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx="10" cy="4" r="2.5" fill="#c084fc" />
          <circle cx="22" cy="4" r="2.5" fill="#ec4899" />
          <circle cx="16" cy="10" r="1.8" fill="url(#g)" />
          <circle cx="16" cy="27" r="1.5" fill="url(#g)" opacity="0.7" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
