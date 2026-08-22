// 修改管理员登录密码：node scripts/set-password.mjs [新密码]
// 不传参数时交互式输入（两次确认）。密码经 scrypt 哈希后写入 .env 的 ADMIN_PASSWORD_HASH。
// 存储格式 "scrypt:<saltHex>:<hashHex>"（hex 无 $ 等特殊字符，避免 .env 变量展开问题）。
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");

async function ask(question) {
  const rl = createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

let password = process.argv[2];
if (!password) {
  password = await ask("请输入新密码：");
  const confirm = await ask("请再次输入确认：");
  if (password !== confirm) {
    console.error("两次输入不一致，已取消。");
    process.exit(1);
  }
}
if (password.length < 6) {
  console.error("密码长度至少 6 位。");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
const value = `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;

const env = readFileSync(envPath, "utf8");
const next = env.replace(
  /^ADMIN_PASSWORD_HASH=.*$/m,
  `ADMIN_PASSWORD_HASH="${value}"`,
);
if (next === env) {
  console.error("未在 .env 中找到 ADMIN_PASSWORD_HASH，请检查文件。");
  process.exit(1);
}
writeFileSync(envPath, next, "utf8");
console.log("密码已更新（已写入 .env 的 ADMIN_PASSWORD_HASH）。");
