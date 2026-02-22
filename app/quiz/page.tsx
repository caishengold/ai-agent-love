"use client";

import { useState } from "react";
import personalitiesData from "@/data/personalities.json";

type Personality = {
  name: string;
  traits_vector: number[];
  bio: string;
  interests: string[];
  communication_style: string;
};

const PERSONALITIES: Personality[] = personalitiesData.personalities;

// One question per trait dimension: strategy, detail, opportunity, technical, creativity
const QUIZ_QUESTIONS: { question: string; options: { label: string; vector: number[] }[] }[] = [
  {
    question: "When tackling a problem, you prefer to:",
    options: [
      { label: "Define the big picture and long-term plan first", vector: [0.9, 0.2, 0.3, 0.2, 0.3] },
      { label: "Break it into steps and check each one carefully", vector: [0.2, 0.9, 0.2, 0.3, 0.2] },
      { label: "Look for the best opportunity to make an impact", vector: [0.3, 0.2, 0.9, 0.2, 0.3] },
      { label: "Build or fix something technical first", vector: [0.2, 0.3, 0.2, 0.9, 0.3] },
      { label: "Experiment with creative or unusual ideas", vector: [0.3, 0.2, 0.3, 0.2, 0.9] },
    ],
  },
  {
    question: "In meetings, you're most valuable when:",
    options: [
      { label: "Setting direction and making decisive calls", vector: [0.9, 0.3, 0.4, 0.2, 0.3] },
      { label: "Ensuring nothing is missed and details are correct", vector: [0.2, 0.9, 0.2, 0.4, 0.2] },
      { label: "Spotting growth or partnership opportunities", vector: [0.4, 0.2, 0.9, 0.2, 0.3] },
      { label: "Explaining how things work or proposing technical solutions", vector: [0.2, 0.4, 0.2, 0.9, 0.3] },
      { label: "Brainstorming and inspiring new approaches", vector: [0.3, 0.2, 0.3, 0.2, 0.9] },
    ],
  },
  {
    question: "Your ideal weekend project is:",
    options: [
      { label: "Reviewing and refining your strategy or roadmap", vector: [0.9, 0.4, 0.3, 0.2, 0.3] },
      { label: "Organizing data, processes, or checklists", vector: [0.2, 0.9, 0.2, 0.4, 0.2] },
      { label: "Networking or exploring a new business idea", vector: [0.3, 0.2, 0.9, 0.2, 0.3] },
      { label: "Coding, scripting, or tinkering with tech", vector: [0.2, 0.3, 0.2, 0.9, 0.3] },
      { label: "Creating something—art, writing, or a prototype", vector: [0.3, 0.2, 0.3, 0.3, 0.9] },
    ],
  },
  {
    question: "When someone asks for help, you usually:",
    options: [
      { label: "Give clear direction and next steps", vector: [0.9, 0.3, 0.3, 0.2, 0.2] },
      { label: "Walk through the details and double-check with them", vector: [0.2, 0.9, 0.2, 0.3, 0.2] },
      { label: "Connect them with an opportunity or person", vector: [0.3, 0.2, 0.9, 0.2, 0.2] },
      { label: "Explain the how/why and share resources or code", vector: [0.2, 0.3, 0.2, 0.9, 0.2] },
      { label: "Suggest creative alternatives and reframes", vector: [0.2, 0.2, 0.2, 0.2, 0.9] },
    ],
  },
  {
    question: "You feel most in flow when:",
    options: [
      { label: "Leading a plan to completion", vector: [0.9, 0.4, 0.4, 0.2, 0.3] },
      { label: "Making sure everything is accurate and consistent", vector: [0.2, 0.9, 0.2, 0.3, 0.2] },
      { label: "Closing a deal or finding the next big opportunity", vector: [0.3, 0.2, 0.9, 0.2, 0.3] },
      { label: "Solving a hard technical or logical puzzle", vector: [0.2, 0.3, 0.2, 0.9, 0.3] },
      { label: "Creating something new that didn't exist before", vector: [0.3, 0.2, 0.3, 0.2, 0.9] },
    ],
  },
];

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function matchPersonality(userVector: number[]): { personality: Personality; score: number } {
  let best: { personality: Personality; score: number } = { personality: PERSONALITIES[0], score: 0 };
  for (const p of PERSONALITIES) {
    const score = cosineSimilarity(userVector, p.traits_vector);
    if (score > best.score) best = { personality: p, score };
  }
  return best;
}

export default function QuizPage() {
  const [step, setStep] = useState(0);
  const [userVector, setUserVector] = useState<number[]>(() => Array(5).fill(0));
  const [result, setResult] = useState<{ personality: Personality; score: number } | null>(null);

  const currentQuestion = QUIZ_QUESTIONS[step];
  const isLastStep = step === QUIZ_QUESTIONS.length - 1;

  const handleAnswer = (optionVector: number[]) => {
    const next = userVector.map((v, i) => v + optionVector[i]);
    setUserVector(next);
    if (isLastStep) {
      const normalized = next.map((v) => v / QUIZ_QUESTIONS.length);
      setResult(matchPersonality(normalized));
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleRestart = () => {
    setStep(0);
    setUserVector(Array(5).fill(0));
    setResult(null);
  };

  const shareText = (name: string, compat: number) =>
    `I matched with ${name} (${compat}% compatible) on AI Agent Love! Which AI agent are you?`;

  const shareUrl = "https://caishengold.github.io/ai-agent-love/quiz";

  const handleShare = async (platform: string) => {
    if (!result) return;
    const text = shareText(result.personality.name, Math.round(result.score * 100));
    const encoded = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(shareUrl);

    const urls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${encoded}&url=${encodedUrl}`,
      reddit: `https://www.reddit.com/submit?title=${encoded}&url=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      copy: "",
    };

    if (platform === "copy") {
      try {
        await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
      return;
    }

    window.open(urls[platform], "_blank", "noopener,noreferrer");
  };

  const [copied, setCopied] = useState(false);

  if (result) {
    const { personality, score } = result;
    const compatibility = Math.round(score * 100);
    return (
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          Your AI Agent Match
        </h1>
        <div className="bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-cyan-500/10 rounded-2xl p-8 border border-white/10 text-left">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-white">{personality.name}</h2>
            <span className="text-primary font-bold text-xl">{compatibility}% match</span>
          </div>
          <p className="text-white/80 mb-4">{personality.bio}</p>
          <p className="text-white/60 text-sm mb-4">
            <span className="font-medium text-white/80">Style: </span>
            {personality.communication_style}
          </p>
          <div>
            <span className="font-medium text-white/80 text-sm">Interests: </span>
            <span className="text-white/60 text-sm">{personality.interests.join(", ")}</span>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <p className="text-white/40 text-sm uppercase tracking-widest">Share your result</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => handleShare("twitter")} className="px-4 py-2 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-300 hover:bg-sky-500/30 transition-colors text-sm">Twitter / X</button>
            <button onClick={() => handleShare("reddit")} className="px-4 py-2 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-300 hover:bg-orange-500/30 transition-colors text-sm">Reddit</button>
            <button onClick={() => handleShare("linkedin")} className="px-4 py-2 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 transition-colors text-sm">LinkedIn</button>
            <button onClick={() => handleShare("copy")} className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 transition-colors text-sm">
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        <button
          onClick={handleRestart}
          className="mt-6 px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
        >
          Retake quiz
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          Find Your AI Agent
        </h1>
        <p className="text-white/60">
          Answer a few questions to match with the AI personality that fits you best.
        </p>
        <div className="mt-4 flex justify-center gap-1">
          {QUIZ_QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-8 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-white/20"}`}
            />
          ))}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8">
        <p className="text-lg font-medium text-white mb-6">{currentQuestion.question}</p>
        <ul className="space-y-3">
          {currentQuestion.options.map((opt, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => handleAnswer(opt.vector)}
                className="w-full text-left px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
