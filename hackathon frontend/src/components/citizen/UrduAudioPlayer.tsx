import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UrduAudioPlayerProps {
  title: string;
  urduText: string;
  englishSubtitle?: string;
}

export function UrduAudioPlayer({
  title,
  urduText,
  englishSubtitle,
}: UrduAudioPlayerProps) {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const startSpeaking = () => {
    if (
      typeof window === 'undefined' ||
      typeof window.speechSynthesis === 'undefined'
    ) {
      setVoiceNote(
        'Browser Speech Synthesis unavailable; displaying Urdu audio script visually.',
      );
      setSpeaking(true);
      globalThis.setTimeout(() => setSpeaking(false), 3000);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(urduText);
    utterance.lang = 'ur-PK';
    utterance.rate = 0.92;

    const voices = window.speechSynthesis.getVoices();
    const urduVoice =
      voices.find((v) => v.lang.toLowerCase().startsWith('ur')) ??
      voices.find((v) => v.lang.toLowerCase().startsWith('ar'));

    if (urduVoice) {
      utterance.voice = urduVoice;
      setVoiceNote(null);
    } else {
      setVoiceNote(
        'Playing via default OS speech engine (no dedicated Urdu voice pack installed on this device).',
      );
    }

    utterance.onstart = () => {
      setSpeaking(true);
      setPaused(false);
    };
    utterance.onend = () => {
      setSpeaking(false);
      setPaused(false);
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const togglePauseResume = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else if (speaking) {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  };

  const stopPlayback = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
    setPaused(false);
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-blue-200 bg-blue-50/70 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#1E3A8A]">
          <Volume2 className="h-4 w-4 shrink-0" aria-hidden />
          <span>{title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!speaking ? (
            <Button
              type="button"
              size="sm"
              onClick={startSpeaking}
              className="min-h-10 gap-1.5 bg-[#1D4ED8] text-white hover:bg-[#1E40AF]"
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
              <span>Listen in Urdu / سنیں</span>
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={togglePauseResume}
                className="min-h-10 gap-1.5 bg-white"
              >
                {paused ? (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" aria-hidden />
                    <span>Pause</span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={stopPlayback}
                className="min-h-10 gap-1.5 bg-white"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                <span>Stop</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <p
        dir="rtl"
        lang="ur"
        className={`font-urdu rounded-lg border px-3 py-2 text-base transition-colors ${
          speaking && !paused
            ? 'border-blue-400 bg-white text-slate-950 shadow-xs'
            : 'border-blue-100 bg-white/80 text-slate-900'
        }`}
      >
        {urduText}
      </p>

      {englishSubtitle && (
        <p className="text-xs text-slate-600">{englishSubtitle}</p>
      )}
      {voiceNote && (
        <p className="text-[11px] text-slate-500">{voiceNote}</p>
      )}
    </div>
  );
}
