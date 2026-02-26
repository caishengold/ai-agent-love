import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0a0812, #1a0a2e)', borderRadius: 40 }}>
        <svg width="120" height="120" viewBox="0 0 32 32">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          <path d="M16 28S3 18.5 3 10.5C3 6.36 6.36 3 10.5 3c2.54 0 4.78 1.26 6.15 3.19A7.48 7.48 0 0122.5 3C26.09 3 29 6.36 29 10.5 29 18.5 16 28 16 28z" fill="url(#g)" />
          <circle cx="11" cy="12" r="1.5" fill="white" opacity="0.9" />
          <circle cx="21" cy="12" r="1.5" fill="white" opacity="0.9" />
          <path d="M12.5 17.5Q16 20 19.5 17.5" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.8" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
