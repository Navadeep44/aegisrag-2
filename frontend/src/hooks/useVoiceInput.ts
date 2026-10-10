import { useCallback, useEffect, useRef, useState } from "react";

interface UseVoiceInputOptions {
  onTextChange?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceInput({ onTextChange, onError }: UseVoiceInputOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [volume, setVolume] = useState(0); // 0 to 1
  const [isSupported, setIsSupported] = useState(false);

  const isListeningRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const baseTextRef = useRef<string>("");
  const finalTranscriptRef = useRef<string>("");

  // Check browser support on mount
  useEffect(() => {
    const hasSpeech =
      typeof window !== "undefined" &&
      Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    setIsSupported(hasSpeech);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, []);

  const cleanupResources = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimTranscript("");
    setVolume(0);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== "closed") {
          audioContextRef.current.close();
        }
      } catch {
        /* ignore */
      }
      audioContextRef.current = null;
    }
  }, []);

  // Setup live audio visualizer analyzer
  const startAudioMeter = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateMeter = () => {
        if (!isListeningRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(1, Math.max(0, avg / 128));
        setVolume(normalized);
        animationFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch {
      // Audio meter is optional visual feedback; if mic stream fails, recognition may still work
    }
  }, []);

  const startListening = useCallback(
    (currentText: string = "") => {
      if (isListeningRef.current) return;

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        onError?.(
          "Voice input is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Apple Safari for speech recognition."
        );
        return;
      }

      cleanupResources();

      baseTextRef.current = currentText.trim();
      finalTranscriptRef.current = "";
      isListeningRef.current = true;
      setIsListening(true);
      setInterimTranscript("");

      // Start audio visualizer meter
      startAudioMeter();

      try {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = navigator.language || "en-US";

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          let interim = "";
          let finalDelta = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const item = event.results[i];
            const text = item[0]?.transcript || "";
            if (item.isFinal) {
              finalDelta += (finalDelta ? " " : "") + text;
            } else {
              interim += text;
            }
          }

          if (finalDelta.trim()) {
            finalTranscriptRef.current = (
              finalTranscriptRef.current + " " + finalDelta.trim()
            ).trim();
          }

          setInterimTranscript(interim.trim());

          // Construct combined string
          const parts = [
            baseTextRef.current,
            finalTranscriptRef.current,
            interim.trim(),
          ].filter(Boolean);

          const full = parts.join(" ").replace(/\s+/g, " ");
          onTextChange?.(full);
        };

        recognition.onerror = (event: any) => {
          const err = event.error;
          if (err === "no-speech") {
            // Keep listening silently
            return;
          }
          if (err === "not-allowed" || err === "service-not-allowed") {
            onError?.(
              "Microphone permission was denied. Please allow microphone access in your browser address bar."
            );
            cleanupResources();
            return;
          }
          if (err === "network") {
            onError?.("Network error occurred during speech recognition. Please check your connection.");
            cleanupResources();
            return;
          }
          if (err === "aborted") {
            // User aborted or restarted
            return;
          }
        };

        recognition.onend = () => {
          // If still marked as listening (e.g. browser timed out during silence), gracefully restart
          if (isListeningRef.current) {
            try {
              recognition.start();
            } catch {
              cleanupResources();
            }
          } else {
            cleanupResources();
          }
        };

        recognition.start();
      } catch (err: any) {
        onError?.(err?.message || "Failed to initialize voice recognition.");
        cleanupResources();
      }
    },
    [cleanupResources, startAudioMeter, onTextChange, onError]
  );

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimTranscript("");
    setVolume(0);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
    }

    cleanupResources();
  }, [cleanupResources]);

  const toggleListening = useCallback(
    (currentText: string = "") => {
      if (isListening) {
        stopListening();
      } else {
        startListening(currentText);
      }
    },
    [isListening, startListening, stopListening]
  );

  return {
    isSupported,
    isListening,
    interimTranscript,
    volume,
    startListening,
    stopListening,
    toggleListening,
  };
}
