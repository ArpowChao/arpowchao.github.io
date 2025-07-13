# 使用官方 Ruby 映像檔作為基礎，確保環境乾淨
FROM ruby:3.2-bullseye

# 安裝系統依賴項，例如 Node.js 和其他編譯工具
RUN apt-get update && apt-get install -y \
  nodejs \
  npm \
  build-essential

# 設定工作目錄
WORKDIR /workspace

# 安裝 Bundler 和 Jekyll
RUN gem install bundler jekyll

# 將 Gemfile 和 Gemfile.lock 複製到容器中
COPY Gemfile Gemfile.lock ./

# 將 package.json 和 package-lock.json 複製到容器中
COPY package.json package-lock.json ./

# 暴露 Jekyll 伺服器的預設端口
EXPOSE 4000
