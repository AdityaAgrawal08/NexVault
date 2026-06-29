import { BloomFilter } from "../../shared/utils/bloom-filter";
import { authRepository } from "./auth.repository";

export const usernameBloomFilter = new BloomFilter();

let initialized = false;

export async function initializeUsernameBloomFilter() {
  if (initialized) return;
  try {
    const usernames = await authRepository.getAllUsernames();
    for (const username of usernames) {
      usernameBloomFilter.add(username.toLowerCase());
    }
    initialized = true;
    console.log(`[BloomFilter] Loaded ${usernames.length} usernames.`);
  } catch (error) {
    console.error("[BloomFilter] Failed to initialize:", error);
  }
}
