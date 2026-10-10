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

/**
 * Selects the highest quality natural female voice available in the browser.
 */
function selectNaturalFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  // Priority 1: High quality Natural / Neural Female voices
  const highQualityFemaleNames = [
    "microsoft jenny online (natural)",
    "microsoft aria online (natural)",
    "google us english",
    "google uk english female",
    "samantha",
    "ava (premium)",
    "ava (enhanced)",
    "ava",
    "allison",
    "victoria",
    "karen",
    "serena",
    "microsoft zira",
    "zira",
  ];

  for (const name of highQualityFemaleNames) {
    const found = voices.find(
      (v) => v.lang.startsWith("en") && v.name.toLowerCase().includes(name)
    );
    if (found) return found;
  }

  // Priority 2: Any English voice with "female" or "woman" in its name
  const genericFemale = voices.find(
    (v) =>
      v.lang.startsWith("en") &&
      (v.name.toLowerCase().includes("female") ||
        v.name.toLowerCase().includes("woman") ||
        v.name.toLowerCase().includes("girl"))
  );
  if (genericFemale) return genericFemale;

  // Priority 3: Common female voice identifiers
  const knownFemaleNames = [
    "samantha",
    "aria",
    "jenny",
    "zira",
    "victoria",
    "karen",
    "susan",
    "ava",
    "allison",
    "serena",
    "stephanie",
    "moira",
    "tessa",
  ];
  const knownFemale = voices.find(
    (v) =>
      v.lang.startsWith("en") &&
      knownFemaleNames.some((n) => v.name.toLowerCase().includes(n))
  );
  if (knownFemale) return knownFemale;

  // Priority 4: Any English voice that is NOT explicitly male
  const maleExclusions = [
    "david",
    "mark",
    "guy",
    "george",
    "alex",
    "fred",
    "daniel",
    "male",
    "richard",
    "james",
    "brian",
    "oliver",
  ];
  const nonMaleEnglish = voices.find(
    (v) =>
      v.lang.startsWith("en") &&
      !maleExclusions.some((m) => v.name.toLowerCase().includes(m))
  );
  if (nonMaleEnglish) return nonMaleEnglish;

  // Fallback: Best English voice
  return voices.find((v) => v.lang.startsWith("en")) || voices[0] || null;
}

// Global speaking state so only one message speaks across the app
let globalStopCallback: (() => void) | null = null;

export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const isSpeakingRef = useRef(false);
  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);

  // Pre-load available voices asynchronously
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        setVoices(v);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

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
    // Medium, relaxed, conversational pacing (0.88x) so it never sounds rushed
    utterance.rate = 0.88;
    // Pleasant natural female pitch
    utterance.pitch = 1.05;

    // Select the best natural female voice
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const currentVoiceList =
        voices.length > 0 ? voices : window.speechSynthesis.getVoices();
      const femaleVoice = selectNaturalFemaleVoice(currentVoiceList);

      if (femaleVoice) {
        utterance.voice = femaleVoice;
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
  }, [voices, stop]);

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
