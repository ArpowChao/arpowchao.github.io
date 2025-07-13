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

# 【改回】直接複製 Gemfile，因為現在的視野是專案根目錄
COPY Gemfile ./
RUN bundle install

# 【改回】直接複製 package.json
# 檢查 package.json 是否存在，如果存在才複製並執行 npm install
RUN if [ -f package.json ]; then \
    npm install; \
    fi

# 【改回】直接複製所有檔案
COPY . .
