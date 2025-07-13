# 使用官方的 Ruby 映像檔作為基礎
FROM ruby:3.2-bullseye

# 安裝必要的系統工具，包含 git、Node.js 和 npm
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# 設定工作目錄
WORKDIR /workspace

# 【修正】從上一層目錄 (../) 複製 Gemfile
COPY ../Gemfile ./
RUN bundle install

# 【修正】從上一層目錄 (../) 複製 package.json
# 檢查 package.json 是否存在，如果存在才複製並執行 npm install
RUN if [ -f ../package.json ]; then \
    cp ../package.json . && \
    npm install; \
    fi

# 【修正】從上一層目錄 (../) 複製專案的所有其他檔案
COPY .. .
