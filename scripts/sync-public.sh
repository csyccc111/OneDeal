#!/usr/bin/env bash
# OneDeal 发版同步：从 master（完整开发版）生成干净 public 快照，推公开仓库
# 用法：bash scripts/sync-public.sh ["可选提交信息"]
# 前提：当前本地仓库已配置 origin=https://github.com/csyccc111/OneDeal.git（公开）
# 原理：孤儿分支（无历史）重建单提交 → 公开仓库永远只有一份干净快照，无内部文档、无历史泄露
set -euo pipefail

COMMIT_MSG="${1:-OneDeal 公开版快照 $(date +%Y%m%d-%H%M%S)}"
ORIG_BRANCH="$(git branch --show-current)"

# 1. 确保在 master（开发主线）
git checkout master

# 2. 删除旧 public 分支（每次重建）
git branch -D public 2>/dev/null || true

# 3. 创建孤儿分支：工作区文件保留，index 从 master 树重建
git checkout --orphan public
git rm -rf --cached . >/dev/null
git add -A   # .gitignore 自动过滤内部文档/业务数据文件

# 4. 安全检查：暂存区绝不允许出现内部文件（双重保险）
BAD=$(git diff --cached --name-only | grep -E "PROJECT_MEMORY|方案|开发Prompt|部署指南|隧道|使用指南|主机修复|任务Prompt|WxPusher|差异比对|AGENTS|CLAUDE|\.xls|\.xlsx|\.docx|\.et" || true)
if [ -n "$BAD" ]; then
  echo "!!! 公开版暂存区包含内部文件，已中止："
  echo "$BAD"
  git checkout master >/dev/null 2>&1
  git branch -D public 2>/dev/null || true
  exit 1
fi

# 5. 提交并强推公开仓库 master（单提交，无历史）
git commit -m "$COMMIT_MSG" >/dev/null
SNAPSHOT="$(git rev-parse --short HEAD)"
git push -f origin public:master

# 6. 回到原分支并清理
git checkout "$ORIG_BRANCH" >/dev/null 2>&1
git branch -D public 2>/dev/null || true

echo "✅ 公开仓库已同步（快照 $SNAPSHOT）"
