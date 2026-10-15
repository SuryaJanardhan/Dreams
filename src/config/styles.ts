import { present } from "../compat/guards.js";
const COLORS = {
  SUNDAY: {
    name: "Warm Orange",
    primary: "#FF6B35",
    background: "#1a1a1a",
    accent: "#FFD700",
  },
  MONDAY: {
    name: "Cool Blue",
    primary: "#4A90E2",
    background: "#1a1a1a",
    accent: "#00f3ff",
  },
  TUESDAY: {
    name: "Fresh Green",
    primary: "#50C878",
    background: "#1a1a1a",
    accent: "#00ff9d",
  },
  WEDNESDAY: {
    name: "Vibrant Purple",
    primary: "#9B59B6",
    background: "#1a1a1a",
    accent: "#ff00dd",
  },
  THURSDAY: {
    name: "Energetic Red",
    primary: "#E74C3C",
    background: "#1a1a1a",
    accent: "#ff4444",
  },
  FRIDAY: {
    name: "Golden Yellow",
    primary: "#F1C40F",
    background: "#1a1a1a",
    accent: "#ffff00",
  },
  SATURDAY: {
    name: "Neon Pink",
    primary: "#E91E63",
    background: "#1a1a1a",
    accent: "#ff00ff",
  },
};

const DAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

const getDayBasedTheme = () =>
  COLORS[present(DAYS[new Date().getDay()], "Calendar day")];

const getRandomTheme = () =>
  COLORS[present(DAYS[Math.floor(Math.random() * DAYS.length)], "Theme key")];

export = {
  COLORS,
  getDayBasedTheme,
  getRandomTheme,
};
