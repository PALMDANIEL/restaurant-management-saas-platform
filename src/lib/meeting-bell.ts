"use client";

import { getAudioContext } from "./order-chime";

/**
 * Sonnerie de rappel de réunion : « ding-dong » répété trois fois (environ 7 secondes),
 * volontairement différente du carillon des commandes pour ne pas être confondue avec lui.
 * Synthétisée, aucun fichier audio. Le navigateur n'autorise le son qu'après un premier geste
 * de la personne sur la page (voir unlockAudioOnFirstTouch).
 */
export function playMeetingBell() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const tones = [880, 659.25]; // La5 puis Mi5 : « ding » aigu, « dong » plus grave
  for (let round = 0; round < 3; round++) {
    tones.forEach((freq, i) => {
      const start = now + round * 2.3 + i * 0.6;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1.6);
    });
  }
}

/** Débloque le son dès le premier toucher/clic : sans cela, un rappel qui sonne en arrière-plan reste muet. */
export function unlockAudioOnFirstTouch() {
  if (typeof window === "undefined") return () => {};
  const unlock = () => {
    getAudioContext();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}
