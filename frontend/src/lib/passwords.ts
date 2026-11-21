/**
 * Password generation (cryptographically random) and a strength estimate.
 *
 * Strength is an entropy estimate with penalties for common patterns; it is a guide for
 * the user, not a guarantee.
 */

export interface GeneratorOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  /** Leave out look-alike characters (0/O, 1/l/I). */
  avoidAmbiguous: boolean;
}

export const DEFAULT_GENERATOR: GeneratorOptions = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: true,
};

const SETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/~",
};
const AMBIGUOUS = /[0O1lI|]/g;

/** Uniform random integer in [0, max) without modulo bias. */
function randomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
}

export function generatePassword(options: GeneratorOptions = DEFAULT_GENERATOR): string {
  const groups = (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((key) => options[key])
    .map((key) => (options.avoidAmbiguous ? SETS[key].replace(AMBIGUOUS, "") : SETS[key]));
  if (!groups.length) groups.push(SETS.lower);
  const all = groups.join("");
  const length = Math.max(groups.length, Math.min(128, options.length));
  // One character from every chosen group, the rest from all of them, then shuffle.
  const chars = groups.map((group) => group[randomInt(group.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const WORDS = (
  "amber anchor apple arrow aspen atlas autumn bamboo basil beacon berry birch bison blossom bold " +
  "breeze bridge bright brook cactus camel canyon cedar cherry cinder citrus clover cobalt comet " +
  "coral cosmic cotton crane crystal cypress dawn delta desert dolphin dragon dune eagle echo ember " +
  "falcon fern fiesta flint forest fossil frost galaxy garden gecko ginger glacier granite harbor " +
  "hazel heron honey horizon island ivory jade jasmine jungle kiwi lagoon lantern lemon lilac lotus " +
  "lunar maple marble meadow meteor mint mosaic nebula nectar noble north oasis ocean olive onyx " +
  "orbit orchid otter panda pebble pepper phoenix pine planet plum polar prairie quartz quiet rain " +
  "raven reef river robin ruby saffron sage salmon sapphire shadow sierra silver sky solar spruce " +
  "starlit stone storm summit sunny swift tango thunder tiger timber topaz tulip tundra velvet " +
  "violet walnut willow winter wolf zephyr zinc"
).split(" ");

export function generatePassphrase(words = 5, separator = "-"): string {
  const picked = Array.from({ length: words }, () => WORDS[randomInt(WORDS.length)]);
  // A digit makes it acceptable for sites that demand one.
  return `${picked.join(separator)}${separator}${randomInt(100)}`;
}

export interface Strength {
  /** 0 very weak … 4 very strong */
  level: 0 | 1 | 2 | 3 | 4;
  bits: number;
}

const COMMON =
  /^(password|passw0rd|qwerty|123456|111111|abc123|letmein|admin|welcome|iloveyou|monkey|dragon)/i;

export function passwordStrength(password: string): Strength {
  if (!password) return { level: 0, bits: 0 };
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^A-Za-z0-9]/.test(password)) pool += 33;
  const unique = new Set(password).size;
  let bits = Math.log2(Math.max(pool, 2)) * Math.min(password.length, unique * 2);
  if (COMMON.test(password)) bits = Math.min(bits, 10);
  if (/(.)\1{3,}/.test(password)) bits *= 0.7;
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf)/i.test(password)) bits *= 0.8;
  const level = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return { level, bits: Math.round(bits) };
}
