import { FONTS, type Settings } from "./types";

/**
 * Applies user settings to the document via data-attributes and CSS custom
 * properties. All components consume the variables — nothing is hard-coded.
 */
export function applySettings(s: Settings) {
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.dataset.fontsize = s.fontSize;
  root.dataset.density = s.density;
  root.dataset.font = s.font;
  root.dataset.motion = s.reduceMotion ? "reduce" : "full";
  root.dataset.textmotion = s.textMotion;

  const font = FONTS.find((f) => f.key === s.font) ?? FONTS[3];
  root.style.setProperty("--font-family", font.css);

  if (s.accentColor) {
    root.style.setProperty("--accent", s.accentColor);
  } else {
    root.style.removeProperty("--accent");
  }

  if (s.theme === "custom") {
    root.style.setProperty("--bg", s.customBg);
    root.style.setProperty("--surface", s.customSurface);
    root.style.setProperty("--text", s.customText);
    root.style.setProperty(
      "--accent",
      s.accentColor || "#c89b6d"
    );
    root.style.setProperty(
      "--surface-2",
      `color-mix(in srgb, ${s.customSurface} 88%, ${s.customText} 12%)`
    );
    root.style.setProperty(
      "--text-2",
      `color-mix(in srgb, ${s.customText} 62%, ${s.customBg} 38%)`
    );
    root.style.setProperty(
      "--border",
      `color-mix(in srgb, ${s.customText} 14%, ${s.customBg} 86%)`
    );
    root.style.setProperty(
      "--editor-bg",
      `color-mix(in srgb, ${s.customBg} 70%, ${s.customSurface} 30%)`
    );
  } else {
    for (const v of [
      "--bg",
      "--surface",
      "--text",
      "--surface-2",
      "--text-2",
      "--border",
      "--editor-bg",
    ]) {
      root.style.removeProperty(v);
    }
  }
}
