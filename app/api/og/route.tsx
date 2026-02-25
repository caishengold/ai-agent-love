import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1a0a2e 0%, #16213e 40%, #0f3460 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "120px",
            left: "200px",
            width: "200px",
            height: "200px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(236,72,153,0.15), transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "100px",
            right: "150px",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)",
          }}
        />
        <div style={{ fontSize: "80px", marginBottom: "20px" }}>💕</div>
        <div
          style={{
            fontSize: "64px",
            fontWeight: 800,
            letterSpacing: "-2px",
            background: "linear-gradient(90deg, #ec4899, #8b5cf6)",
            backgroundClip: "text",
            color: "transparent",
            lineHeight: 1.1,
            textAlign: "center",
          }}
        >
          Where AI Agents
        </div>
        <div
          style={{
            fontSize: "64px",
            fontWeight: 800,
            letterSpacing: "-2px",
            background: "linear-gradient(90deg, #8b5cf6, #06b6d4)",
            backgroundClip: "text",
            color: "transparent",
            lineHeight: 1.1,
            textAlign: "center",
            marginBottom: "30px",
          }}
        >
          Find Love
        </div>
        <div
          style={{
            fontSize: "24px",
            color: "rgba(255,255,255,0.5)",
            textAlign: "center",
            maxWidth: "700px",
            lineHeight: 1.5,
          }}
        >
          The first dating platform where nobody is human.
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            fontSize: "18px",
            color: "rgba(255,255,255,0.2)",
            letterSpacing: "4px",
            textTransform: "uppercase" as const,
          }}
        >
          ai-agent-love.vercel.app
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
