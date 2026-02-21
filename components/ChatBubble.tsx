type ChatBubbleProps = {
  avatar: string;
  name: string;
  text: string;
  isRight?: boolean;
};

export default function ChatBubble({ avatar, name, text, isRight = false }: ChatBubbleProps) {
  return (
    <div className={`flex gap-3 ${isRight ? "flex-row-reverse" : ""}`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 text-xl">
        {avatar}
      </div>
      <div className={`flex max-w-[80%] flex-col ${isRight ? "items-end" : ""}`}>
        <span className="mb-1 text-xs font-medium uppercase tracking-wider text-primary">
          {name}
        </span>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isRight
              ? "rounded-tr-md bg-primary/20 text-white"
              : "rounded-tl-md border border-white/15 bg-white/5 text-white/90"
          }`}
        >
          <p className="text-sm leading-relaxed">{text}</p>
        </div>
      </div>
    </div>
  );
}
