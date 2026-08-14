"use client";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtxCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtxCtor) return null;
  if (!audioCtx) audioCtx = new AudioCtxCtor();
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Joue un carillon mélodieux d'environ 3 secondes (arpège de 4 notes façon clochette),
 * entièrement synthétisé — aucun fichier audio à charger ni droits à gérer.
 * Utilisé pour signaler qu'une nouvelle commande de table vient d'être lancée.
 */
export function playOrderChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  // Arpège C5 - E5 - G5 - C6 : sonne comme une clochette de service, discret et agréable.
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const noteSpacing = 0.22;
  const decay = 2.3;

  notes.forEach((freq, i) => {
    const start = now + i * noteSpacing;

    // Fondamentale
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    // Harmonique légère pour un timbre plus "cloche" que "sifflet"
    const overtone = ctx.createOscillator();
    overtone.type = "sine";
    overtone.frequency.value = freq * 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(0, start);
    overtoneGain.gain.linearRampToValueAtTime(0.06, start + 0.02);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, start + decay * 0.6);

    osc.connect(gain).connect(ctx.destination);
    overtone.connect(overtoneGain).connect(ctx.destination);

    osc.start(start);
    osc.stop(start + decay + 0.1);
    overtone.start(start);
    overtone.stop(start + decay + 0.1);
  });
}
