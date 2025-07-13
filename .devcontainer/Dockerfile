# 使用官方的 Ruby 映像檔作為基礎
FROM ruby:3.2-bullseye

# 安裝必要的系統工具，包含 git、Node.js 和 npm
# 這一步很重要，它會把 npm 工具安裝到我們的環境裡
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# 設定工作目錄
WORKDIR /workspace

# 僅複製 Gemfile，然後安裝 Ruby 套件
# 這樣可以利用 Docker 的快取機制，未來如果只有文章變動，就不用重裝套件
COPY Gemfile ./
RUN bundle install

# 僅複製 package.json，然後安裝 Node.js 套件
# 這會在這裡產生 package-lock.json，解決找不到檔案的問題
COPY package.json ./
RUN npm install

# 最後，將專案的所有其他檔案複製進來
COPY . .
