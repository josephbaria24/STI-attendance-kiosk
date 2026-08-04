let audioCtx: AudioContext | null = null;

const SUCCESS_VOICE_KEY = "attendx_success_voice";

function ensureAudioCtx() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

export function isSuccessVoiceEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(SUCCESS_VOICE_KEY);
    if (v === null) return true;
    return v !== "0" && v !== "false";
  } catch {
    return true;
  }
}

export function setSuccessVoiceEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SUCCESS_VOICE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function playChime() {
  const ctx = ensureAudioCtx();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(1046.5, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    523.25,
    ctx.currentTime + 0.4
  );

  gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.5);
}

export function resumeAudio() {
  ensureAudioCtx();
}

export function playAudioNotif(
  type: "in" | "out" | "class" | "event" | "library" | "duplicate" | "error",
  isLate = false
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  const isSuccess =
    type === "in" ||
    type === "out" ||
    type === "class" ||
    type === "event" ||
    type === "library";
  if (isSuccess && !isSuccessVoiceEnabled()) return;

  window.speechSynthesis.cancel();

  let msg = "";
  switch (type) {
    case "in":
      msg = isLate ? "Late" : "Time in success";
      break;
    case "out":
      msg = "Time out success";
      break;
    case "class":
      msg = "Class attendance success";
      break;
    case "event":
      msg = "Event attendance success";
      break;
    case "library":
      msg = "Library attendance success";
      break;
    case "duplicate":
      msg = "Multiple scanned";
      break;
    case "error":
      msg = "Error, Invalid I D";
      break;
  }

  const utterance = new SpeechSynthesisUtterance(msg);
  utterance.rate = 1.15;
  utterance.onend = () => playChime();
  window.speechSynthesis.speak(utterance);
}
