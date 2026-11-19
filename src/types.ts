export interface EntrySummary {
  id: number;
  title: string;
  content: string;
  mood: string;
  entryDate: string;
  createdAt: string;
  updatedAt: string;
  tags: string;
}

export interface EntryFull extends Omit<EntrySummary, "tags"> {
  tags: string[];
  photos: string[];
}

export interface EntryDraft {
  id: number | null;
  title: string;
  content: string;
  mood: string;
  entryDate: string;
  tags: string[];
  photos: string[];
}

export type ThemeKey = "midnight" | "warm-dark" | "light" | "sepia" | "custom";
export type FontKey = "inter" | "poppins" | "merriweather" | "lora" | "system";

export interface Settings {
  userName: string;
  theme: ThemeKey;
  font: FontKey;
  fontSize: "small" | "medium" | "large";
  density: "compact" | "comfortable";
  accentColor: string;
  customBg: string;
  customSurface: string;
  customText: string;
  showQuote: boolean;
  showNarrator: boolean;
  quoteCategory: string;
  quoteRotate: "startup" | "day";
  reduceMotion: boolean;
  textMotion: "fluid" | "minimal" | "none";
}

export const MOODS = [
  { key: "happy", label: "Happy", color: "#d9a441" },
  { key: "calm", label: "Calm", color: "#6fa287" },
  { key: "okay", label: "Okay", color: "#9a938a" },
  { key: "sad", label: "Sad", color: "#6d87a5" },
  { key: "angry", label: "Angry", color: "#b0605a" },
] as const;

export const moodInfo = (key: string) =>
  MOODS.find((m) => m.key === key) ?? null;

export const SUGGESTED_TAGS = ["University", "Work", "Personal", "Ideas"];

export const DEFAULT_SETTINGS: Settings = {
  userName: "",
  theme: "warm-dark",
  font: "lora",
  fontSize: "medium",
  density: "comfortable",
  accentColor: "",
  customBg: "#17130f",
  customSurface: "#221b14",
  customText: "#ece3d4",
  showQuote: true,
  showNarrator: true,
  quoteCategory: "all",
  quoteRotate: "startup",
  reduceMotion: false,
  textMotion: "fluid",
};

export const SETTINGS_KEYS: Record<keyof Settings, string> = {
  userName: "user_name",
  theme: "theme",
  font: "font",
  fontSize: "font_size",
  density: "density",
  accentColor: "accent_color",
  customBg: "custom_bg",
  customSurface: "custom_surface",
  customText: "custom_text",
  showQuote: "show_quote",
  showNarrator: "show_narrator",
  quoteCategory: "quote_category",
  quoteRotate: "quote_rotate",
  reduceMotion: "reduce_motion",
  textMotion: "text_motion",
};

export const FONTS: {
  key: FontKey;
  name: string;
  css: string;
  desc: string;
}[] = [
  { key: "inter", name: "Inter", css: "'Inter', sans-serif", desc: "Clean and modern" },
  { key: "poppins", name: "Poppins", css: "'Poppins', sans-serif", desc: "Friendly and rounded" },
  { key: "merriweather", name: "Merriweather", css: "'Merriweather', serif", desc: "Classic reading serif" },
  { key: "lora", name: "Lora", css: "'Lora', serif", desc: "A reflective journal font" },
  {
    key: "system",
    name: "System Default",
    css: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    desc: "Native look",
  },
];

export const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export const wordCount = (text: string) =>
  text.trim() ? text.trim().split(/\s+/).length : 0;
