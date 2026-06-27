import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id params (m=19456 KiB, t=2, p=1).
// algorithm: 0=d, 1=i, 2=id (matches @node-rs/argon2 Algorithm enum values).
const opts = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  algorithm: 2, // Argon2id
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, opts);
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  try {
    return await verify(encodedHash, password);
  } catch {
    return false;
  }
}