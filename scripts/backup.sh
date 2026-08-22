#!/usr/bin/env bash
# OneDeal · 自动备份脚本（Linux cron 推荐每日执行）
# 用法：
#   bash scripts/backup.sh [备份目录]           # 备份目录默认 ./backups
#   BACKUP_KEEP=30 bash scripts/backup.sh       # 保留份数（默认 30）
#   BACKUP_DATA_DIR=/opt/onedeal/.next/standalone/data \
#   BACKUP_UPLOADS_DIR=/opt/onedeal/.next/standalone/uploads \
#     bash scripts/backup.sh /var/backups/onedeal
#
# cron 示例（每天 02:00）：
#   0 2 * * * cd /opt/onedeal && bash scripts/backup.sh /var/backups/onedeal >> /var/log/onedeal-backup.log 2>&1
# 恢复：
#   tar -xzf onedeal-backup-*.tar.gz -C /tmp/restore
#   cp /tmp/restore/onedeal.db /tmp/restore/password.json → standalone/data/
#   cp -r /tmp/restore/uploads/. → standalone/uploads/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

BACKUP_DIR="${1:-$PROJECT_DIR/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-30}"
DATA_DIR="${BACKUP_DATA_DIR:-$PROJECT_DIR/data}"
UPLOADS_DIR="${BACKUP_UPLOADS_DIR:-$PROJECT_DIR/uploads}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/onedeal-backup-$STAMP.tar.gz"

if [ ! -f "$DATA_DIR/onedeal.db" ]; then
  echo "!! 数据库不存在：$DATA_DIR/onedeal.db（可用 BACKUP_DATA_DIR 指定运行目录）"
  exit 1
fi

# 打包 onedeal.db + password.json + uploads/（附件；目录不存在则跳过）
# 2026-08-22 事故教训：password.json 与附件此前不在备份内，部署清空 .next 后无法恢复
STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT

cp "$DATA_DIR/onedeal.db" "$STAGING/"
[ -f "$DATA_DIR/password.json" ] && cp "$DATA_DIR/password.json" "$STAGING/"
if [ -d "$UPLOADS_DIR" ]; then
  cp -r "$UPLOADS_DIR" "$STAGING/uploads"
fi

tar -czf "$OUT" -C "$STAGING" .

echo "已备份：$OUT ($(du -h "$OUT" | cut -f1))"

# 清理旧备份，保留最近 BACKUP_KEEP 份
ls -1t "$BACKUP_DIR"/onedeal-backup-*.tar.gz 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | while read -r old; do
  rm -f "$old"
  echo "清理旧备份：$old"
done
