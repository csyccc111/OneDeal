// 账号密码核心逻辑：scrypt 哈希 + 运行时密码文件（data/password.json，优先于 .env）
// 改密即时生效、无需重启；.env 作为初始密码兜底（部署脚本初始化）
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const PASSWORD_FILE = path.join(process.cwd(), "data", "password.json");

export type StoredAccount = {
  username: string;
  passwordHash: string; // scrypt:<saltHex>:<hashHex>
};

// 读取运行时账号（data/password.json 优先，其次 .env）
export function loadAccount(): StoredAccount | null {
  try {
    if (existsSync(PASSWORD_FILE)) {
      const raw = readFileSync(PASSWORD_FILE, "utf8");
      const parsed = JSON.parse(raw) as StoredAccount;
      if (parsed?.username && parsed?.passwordHash) return parsed;
    }
  } catch {
    // 文件损坏时回退 .env
  }
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const passwordHash = process.env.ADMIN_PASSWORD_HASH ?? "";
  if (!passwordHash) return null;
  return { username, passwordHash };
}

// 写入运行时账号（原子写：临时文件 + rename）
export function saveAccount(account: StoredAccount): void {
  mkdirSync(path.dirname(PASSWORD_FILE), { recursive: true });
  const tmp = `${PASSWORD_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(account, null, 2), "utf8");
  renameSync(tmp, PASSWORD_FILE);
}

// 生成 scrypt 哈希：scrypt:<saltHex>:<hashHex>（hex 无 $ 等特殊字符，避免 .env 变量展开问题）
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

// 校验密码
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
