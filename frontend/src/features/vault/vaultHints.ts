/** Readable details of saved passwords (never the passwords), decrypted in the browser. */
import { vaultApi } from "../../api/endpoints";
import type { VaultEntry } from "../../types";
import { decryptJson } from "../../lib/vaultCrypto";

/**
 * Names, usernames, sites and folders of saved passwords (never the passwords), decrypted
 * in the browser. Only possible while the vault is unlocked.
 */
export async function vaultHints(key: CryptoKey | null) {
  if (!key) return [];
  const items = await vaultApi.items();
  const hints = await Promise.all(
    items.map(async (item) => {
      try {
        const entry = await decryptJson<VaultEntry>(key, item.data);
        return {
          id: item.id,
          title: entry.title,
          type: entry.type,
          username: entry.username,
          url: entry.url,
          folder: entry.folder,
          project_id: entry.project_id ?? null,
        };
      } catch {
        return null;
      }
    }),
  );
  return hints.filter((hint): hint is NonNullable<typeof hint> => hint !== null);
}
