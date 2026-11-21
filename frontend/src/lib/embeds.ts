/**
 * Turning a pasted link into something that can be shown inside a page.
 *
 * Only known providers become iframes, and the iframe URL is always built here from
 * the parsed id (never the pasted URL itself), so a link cannot load an arbitrary page.
 * Direct links to image / video / audio files are shown with <img>, <video>, <audio>.
 */

export type EmbedKind = "video" | "audio" | "other";

export interface Embed {
  provider: string;
  /** The iframe URL. */
  src: string;
  kind: EmbedKind;
  /** Width / height, or a fixed height in px for audio players. */
  aspect: number | null;
  height: number | null;
}

type Parser = (url: URL) => Embed | null;

const video = (provider: string, src: string, aspect = 16 / 9): Embed => ({
  provider,
  src,
  kind: "video",
  aspect,
  height: null,
});
const player = (provider: string, src: string, height: number, kind: EmbedKind = "audio"): Embed => ({
  provider,
  src,
  kind,
  aspect: null,
  height,
});

const host = (url: URL) => url.hostname.replace(/^(www\.|m\.|music\.)/, "");

const ID = /^[\w-]{3,64}$/;

const youtube: Parser = (url) => {
  let id: string | null = null;
  const h = host(url);
  if (h === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (h === "youtube.com" || h === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const match = /^\/(?:embed|shorts|live|v)\/([\w-]+)/.exec(url.pathname);
      id = match?.[1] ?? null;
    }
    const list = url.searchParams.get("list");
    if (!id && list && ID.test(list)) {
      return video("YouTube", `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`);
    }
  }
  if (!id || !ID.test(id)) return null;
  const start = Number.parseInt(url.searchParams.get("t") ?? url.searchParams.get("start") ?? "", 10);
  const shorts = url.pathname.startsWith("/shorts/");
  return video(
    "YouTube",
    `https://www.youtube-nocookie.com/embed/${id}${Number.isFinite(start) && start > 0 ? `?start=${start}` : ""}`,
    shorts ? 9 / 16 : 16 / 9,
  );
};

const aparat: Parser = (url) => {
  if (host(url) !== "aparat.com") return null;
  const match = /^\/v\/([\w-]+)/.exec(url.pathname);
  return match && ID.test(match[1])
    ? video("Aparat", `https://www.aparat.com/video/video/embed/videohash/${match[1]}/vt/frame`)
    : null;
};

const vimeo: Parser = (url) => {
  const h = host(url);
  if (h !== "vimeo.com" && h !== "player.vimeo.com") return null;
  const match = /\/(\d{5,})/.exec(url.pathname);
  return match ? video("Vimeo", `https://player.vimeo.com/video/${match[1]}`) : null;
};

const dailymotion: Parser = (url) => {
  const h = host(url);
  let id: string | null = null;
  if (h === "dai.ly") id = url.pathname.slice(1);
  else if (h === "dailymotion.com") id = /^\/video\/([\w]+)/.exec(url.pathname)?.[1] ?? null;
  return id && ID.test(id) ? video("Dailymotion", `https://www.dailymotion.com/embed/video/${id}`) : null;
};

const loom: Parser = (url) => {
  if (host(url) !== "loom.com") return null;
  const match = /^\/(?:share|embed)\/([\w]+)/.exec(url.pathname);
  return match ? video("Loom", `https://www.loom.com/embed/${match[1]}`) : null;
};

const twitch: Parser = (url) => {
  if (host(url) !== "twitch.tv") return null;
  const parent = window.location.hostname || "localhost";
  const videoId = /^\/videos\/(\d+)/.exec(url.pathname)?.[1];
  if (videoId) return video("Twitch", `https://player.twitch.tv/?video=${videoId}&parent=${parent}`);
  const channel = url.pathname.split("/")[1];
  return channel && ID.test(channel)
    ? video("Twitch", `https://player.twitch.tv/?channel=${channel}&parent=${parent}`)
    : null;
};

const spotify: Parser = (url) => {
  if (url.hostname !== "open.spotify.com") return null;
  const match = /^\/(?:intl-[\w-]+\/)?(track|album|playlist|episode|show|artist)\/([\w]+)/.exec(url.pathname);
  if (!match) return null;
  const tall = match[1] !== "track" && match[1] !== "episode";
  return player("Spotify", `https://open.spotify.com/embed/${match[1]}/${match[2]}`, tall ? 380 : 152);
};

const soundcloud: Parser = (url) => {
  if (host(url) !== "soundcloud.com" || url.pathname.split("/").filter(Boolean).length < 2) return null;
  const target = encodeURIComponent(`https://soundcloud.com${url.pathname}`);
  return player(
    "SoundCloud",
    `https://w.soundcloud.com/player/?url=${target}&color=%23e8743b&visual=false`,
    url.pathname.includes("/sets/") ? 360 : 166,
  );
};

const appleMusic: Parser = (url) => {
  if (url.hostname !== "music.apple.com") return null;
  return player("Apple Music", `https://embed.music.apple.com${url.pathname}${url.search}`, 175);
};

const codepen: Parser = (url) => {
  if (host(url) !== "codepen.io") return null;
  const match = /^\/([\w-]+)\/(?:pen|full|details)\/([\w]+)/.exec(url.pathname);
  return match
    ? player("CodePen", `https://codepen.io/${match[1]}/embed/${match[2]}?default-tab=result`, 420, "other")
    : null;
};

const figma: Parser = (url) => {
  if (host(url) !== "figma.com" || !/^\/(file|design|proto|board)\//.test(url.pathname)) return null;
  return video(
    "Figma",
    `https://www.figma.com/embed?embed_host=notes&url=${encodeURIComponent(url.href)}`,
    4 / 3,
  );
};

const googleMaps: Parser = (url) => {
  const isMaps =
    (host(url) === "google.com" && url.pathname.startsWith("/maps")) || url.hostname === "maps.google.com";
  if (!isMaps) return null;
  const query = url.searchParams.get("q") ?? /\/place\/([^/]+)/.exec(url.pathname)?.[1];
  if (!query) return null;
  return video(
    "Google Maps",
    `https://maps.google.com/maps?q=${encodeURIComponent(decodeURIComponent(query))}&output=embed`,
    4 / 3,
  );
};

const PARSERS = [
  youtube,
  aparat,
  vimeo,
  dailymotion,
  loom,
  twitch,
  spotify,
  soundcloud,
  appleMusic,
  codepen,
  figma,
  googleMaps,
];

export function parseUrl(text: string): URL | null {
  const value = text.trim();
  if (!/^https?:\/\/\S+$/i.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function toEmbed(text: string): Embed | null {
  const url = parseUrl(text);
  if (!url) return null;
  for (const parse of PARSERS) {
    const result = parse(url);
    if (result) return result;
  }
  return null;
}

/** Providers we know, for the hint under the "Embed" input. */
export const EMBED_PROVIDERS = [
  "YouTube",
  "Aparat",
  "Vimeo",
  "Spotify",
  "SoundCloud",
  "Apple Music",
  "Dailymotion",
  "Loom",
  "Twitch",
  "CodePen",
  "Figma",
  "Google Maps",
];

export type DirectKind = "image" | "video" | "audio";

/** A direct link to a media file (by extension), https only. */
export function directMediaKind(text: string): DirectKind | null {
  const url = parseUrl(text);
  if (!url || url.protocol !== "https:") return null;
  const path = url.pathname.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(path)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/.test(path)) return "video";
  if (/\.(mp3|ogg|oga|wav|m4a|aac|flac|opus)$/.test(path)) return "audio";
  return null;
}

export function formatBytes(bytes: number, format: (n: number) => string = String): string {
  if (bytes < 1024) return `${format(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${format(Math.round(value * 10) / 10)} ${units[unit]}`;
}
