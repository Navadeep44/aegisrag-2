import { Volume2, Play, Square } from "lucide-react";
import { useTextToSpeech } from "../../hooks/useTextToSpeech";

interface ReadAloudButtonProps {
  text: string;
  id?: string;
  className?: string;
}

export function ReadAloudButton({ text, id, className = "" }: ReadAloudButtonProps) {
  const { speak, stop, isSpeaking, isPaused, activeId, isSupported } = useTextToSpeech();

  if (!isSupported || !text.trim()) return null;

  const isCurrent = Boolean(activeId && id && activeId === id);
  const currentlyPlaying = isCurrent && isSpeaking && !isPaused;
  const currentlyPaused = isCurrent && isPaused;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentlyPlaying) {
      speak(text, id); // will pause
    } else if (currentlyPaused) {
      speak(text, id); // will resume
    } else {
      speak(text, id); // start playing
    }
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    stop();
  };

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        title={currentlyPlaying ? "Pause read-aloud" : currentlyPaused ? "Resume read-aloud" : "Read answer aloud"}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
          currentlyPlaying
            ? "bg-accent text-white shadow-[0_0_12px_rgba(15,118,110,0.4)]"
            : currentlyPaused
            ? "border border-accent/40 bg-accent-light/80 text-accent hover:bg-accent/20"
            : "border border-line bg-surface-subtle text-muted hover:border-accent/40 hover:text-accent hover:bg-surface-raised"
        }`}
      >
        {currentlyPlaying ? (
          <>
            <span className="flex items-center gap-0.5 h-3">
              <span className="w-0.5 h-2.5 bg-white rounded-full animate-pulse" />
              <span className="w-0.5 h-3.5 bg-white rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-0.5 h-2 bg-white rounded-full animate-pulse [animation-delay:300ms]" />
            </span>
            <span className="text-[10px] font-bold tracking-tight">Speaking</span>
          </>
        ) : currentlyPaused ? (
          <>
            <Play className="h-3 w-3" fill="currentColor" />
            <span className="text-[10px] font-bold">Resume</span>
          </>
        ) : (
          <>
            <Volume2 className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium">Listen</span>
          </>
        )}
      </button>

      {(currentlyPlaying || currentlyPaused) && (
        <button
          type="button"
          onClick={handleStop}
          title="Stop read-aloud"
          className="grid h-6 w-6 place-items-center rounded-full border border-line bg-surface text-muted hover:text-deny hover:border-deny/30 transition-colors"
        >
          <Square className="h-2.5 w-2.5" fill="currentColor" />
        </button>
      )}
    </div>
  );
}
