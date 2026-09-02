# PostgreSQL 对接说明

项目的 PostgreSQL 存储是可选的。配置后，服务器端的 `imported-sources`、`analysis-cache`、`applied-date-range` 和 `dqa-engineer-supplement` 会优先从 PostgreSQL 读取；现有 `data/state/*.json` 会自动作为回退，并在首次读取时迁移到数据库。

## 本机调试

1. 本机安装与服务器相同大版本的 PostgreSQL（建议 PostgreSQL 16）。
2. 创建数据库和专用账号，不要把密码写进 Git：

```sql
CREATE USER qms_app WITH PASSWORD '替换为强密码';
CREATE DATABASE qms OWNER qms_app;
```

3. 在项目根目录复制 `.env.example` 为 `.env`，填写：

```text
QMS_DATABASE_URL=postgresql://qms_app:密码@127.0.0.1:5432/qms
```

4. 执行 `npm install`，再启动 `npm run server` 或 `npm run serve`。服务启动日志会显示 PostgreSQL 是否已启用。项目会自动创建 `qms_state` 表，不需要手动执行建表脚本。

## 公司服务器

服务器从 GitHub 下载代码后，执行 `npm install`，通过系统环境变量或 `.env` 提供同样的 `QMS_DATABASE_URL`。数据库建议只监听内网或本机地址，并使用独立账号；不要把 `.env`、数据库密码或 `data/ai-config.json` 上传到 GitHub。

如果 PostgreSQL 暂时不可用，项目仍会读写现有 JSON 文件，不会阻止服务启动。恢复数据库后重新启动服务，缓存会继续同步。

## 知识库PDF解析依赖

PDF原件保存在 `QMS_DATA_DIR/knowledge-originals`，不存入浏览器缓存。服务端需要Python `pypdf` 和Poppler `pdftoppm`：

```bash
sudo apt update
sudo apt install -y python3-pypdf poppler-utils
```

如果发行版没有 `python3-pypdf`：

```bash
python3 -m pip install --user pypdf
```

可在 `.env` 显式配置：

```text
QMS_PYTHON=/usr/bin/python3
QMS_PDFTOPPM=/usr/bin/pdftoppm
```

原生文字可读的PDF在Windows/Linux服务器上都可直接解析。Windows中文OCR只能在Windows执行；Linux服务器遇到扫描页时会保留原件并标记“需要复核/重试”，不会伪造文字。后续如需在Linux自动处理扫描件，应部署Windows OCR Worker，而不是在Node服务中写第二套OCR规则。

## 知识蒸馏后台任务参数

阶段6已将知识蒸馏迁移到服务端队列。浏览器只读取任务索引和进度，关闭页面不会中断后台任务。可在 `.env` 调整以下上限：

```text
QMS_KNOWLEDGE_DISTILL_MAX_CLAUSES=5000
QMS_KNOWLEDGE_DISTILL_BATCH_CHARS=12000
QMS_KNOWLEDGE_DISTILL_BATCH_CLAUSES=50
QMS_KNOWLEDGE_DISTILL_RETRIES=2
```

- `MAX_CLAUSES`：单份文档允许进入一次蒸馏任务的最大条款数，防止异常文档无限扩张。
- `BATCH_CHARS`：单批最大字符数，用于控制模型上下文和上游超时风险。
- `BATCH_CLAUSES`：单批最大条款数，与字符上限同时生效。
- `RETRIES`：单批自动重试次数；任务中心仍可只重试最终失败的批次。

默认值适用于当前试点。服务器内存或模型上下文较小时应下调批次字符数和条款数，不要通过提高浏览器内存解决。后台任务使用管理员保存在服务器 `data/ai-config.json` 的AI接口配置；公司规范和客户资料是否允许发送到外部模型，仍由管理员按资料等级和公司安全要求决定。

## WSL2 Ubuntu 联调（推荐）

在 Windows PowerShell（管理员）执行：

```powershell
wsl --install -d Ubuntu-22.04
wsl --set-default-version 2
```

进入 Ubuntu 后安装 PostgreSQL 官方仓库和 16.x：

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release git build-essential
sudo install -d /usr/share/keyrings
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | sudo gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
apt-cache madison postgresql-16
```

确认列表中有 `16.14` 后再安装对应版本：

```bash
PG_VERSION="$(apt-cache madison postgresql-16 | awk '$3 ~ /^16\.14/ {print $3; exit}')"
test -n "$PG_VERSION" || { echo "仓库暂未提供 16.14，请检查 PGDG 源"; exit 1; }
sudo apt install -y "postgresql-16=$PG_VERSION" "postgresql-client-16=$PG_VERSION"
sudo service postgresql start
psql --version
sudo -u postgres psql -c "SHOW server_version;"
```

随后在 Ubuntu 内安装 Node.js、复制项目并运行 `npm install`、`npm run build`、`npm run server`。Windows 浏览器访问 `http://127.0.0.1:4173`，数据库和 Node 服务都留在 Ubuntu 内，最接近公司 Linux 服务器。
