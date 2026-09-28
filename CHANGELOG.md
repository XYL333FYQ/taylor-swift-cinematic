# 更新记录

## 未发布

- 新增 `music:upload`：从 `incoming/` 检查并增量上传专辑或歌曲，以 R2 当前 Catalog 为准合并，上传成功后移入 `uploaded/`；提供预览、重复检测和失败重试。
- 保留 `music:sync` 的完整本地曲库同步用途；本地明显少于云端 Catalog 时需显式使用 `--force` 才能继续。
- 两个命令共用当前专辑扫描、Catalog 格式、R2 配置和目标锁。上传模式不自动删除云端媒体。
- 新增本地 `music:check` 检查命令；上传归档保留 `incoming/Album/` 的原名与内部结构，遇到同名归档提前报错。
- 工作区改为云端优先：Git 仅保留 `audio/`、`incoming/`、`uploaded/` 的空目录框架；演示专辑媒体由 R2 提供，本地 `audio/` 可为空。
