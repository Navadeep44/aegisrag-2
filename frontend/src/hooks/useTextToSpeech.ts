import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cleans markdown formatting, citations, tables and symbols
 * so the speech synthesizer reads fluent, natural prose.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return "";
  return text
    // Strip code blocks
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // Strip markdown links [label](url) -> label
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Strip citation indicators like [1], [2], [1, 2]
    .replace(/\[\d+(?:,\s*\d+)*\]/g, "")
    // Strip markdown headers
    .replace(/^#+\s+/gm, "")
    // Strip table delimiters and separators
    .replace(/\|/g, " ")
    .replace(/[-:]{3,}/g, "")
    // Strip bold and italic symbols
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Convert list bullets to brief pauses
    .replace(/^[\s*•\-+]+(?=\S)/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    // Replace double newlines with period and space for natural sentence cadence
    .replace(/\n\s*\n/g, ". ")
    .replace(/\n/g, " ")
    // Deduplicate spaces and periods
    .replace(/\s{2,}/g, " ")
    .replace(/\.{2,}/g, ".")
    .trim();
}

/**
 * Splits text into individual sentences for speech synthesis
 * to prevent browser utterance timeout issues (Chrome 15s bug).
 */
function splitIntoSentences(text: string): string[] {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return [];
  // Match sentences ending in ., !, ? or semicolon
  const sentences = cleaned.match(/[^.!?;\n]+[.!?;\n]+/g) || [cleaned];
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

// Global speaking state so only one message speaks across the app
let globalStopCallback: (() => void) | null = null;

export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const isSpeakingRef = useRef(false);
  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setIsPaused(false);
    setActiveId(null);
    activeIdRef.current = null;
    sentencesRef.current = [];
    currentIndexRef.current = 0;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isSpeakingRef.current) {
        stop();
      }
    };
  }, [stop]);

  const speakNextSentence = useCallback(() => {
    if (!isSpeakingRef.current) return;
    if (currentIndexRef.current >= sentencesRef.current.length) {
      stop();
      return;
    }

    const sentence = sentencesRef.current[currentIndexRef.current];
    currentIndexRef.current += 1;

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = 1.02; // natural conversational pacing
    utterance.pitch = 1.0;

    // Pick best available English voice
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          (v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Guy") || v.name.includes("Aria"))) ||
          v.lang === "en-US"
      ) || voices.find((v) => v.lang.startsWith("en"));

      if (preferred) {
        utterance.voice = preferred;
      }
    }

    utterance.onend = () => {
      if (isSpeakingRef.current) {
        speakNextSentence();
      }
    };

    utterance.onerror = (e) => {
      if (e.error !== "canceled" && e.error !== "interrupted") {
        if (isSpeakingRef.current) {
          speakNextSentence();
        }
      }
    };

    window.speechSynthesis.speak(utterance);
  }, [stop]);

  const speak = useCallback(
    (text: string, id?: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }

      // If already speaking this exact ID, toggle pause/play
      if (isSpeakingRef.current && activeIdRef.current === id) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
          setIsPaused(false);
          return;
        } else {
          window.speechSynthesis.pause();
          setIsPaused(true);
          return;
        }
      }

      // Stop any other active speech globally
      if (globalStopCallback) {
        globalStopCallback();
      }
      globalStopCallback = stop;

      window.speechSynthesis.cancel();

      const sentences = splitIntoSentences(text);
      if (!sentences.length) return;

      sentencesRef.current = sentences;
      currentIndexRef.current = 0;
      isSpeakingRef.current = true;
      activeIdRef.current = id || null;

      setIsSpeaking(true);
      setIsPaused(false);
      setActiveId(id || null);

      speakNextSentence();
    },
    [speakNextSentence, stop]
  );

  return {
    speak,
    stop,
    isSpeaking,
    isPaused,
    activeId,
    isSupported: typeof window !== "undefined" && "speechSynthesis" in window,
  };
}
