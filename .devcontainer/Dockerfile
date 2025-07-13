# Dockerfile (v2 - with GitHub CLI)

# Step 1: 選擇基礎作業系統與工具
FROM ruby:3.2-bullseye

# Step 2: 安裝額外的系統依賴
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# 【新增步驟】安裝 GitHub CLI (gh)
# 這是官方建議的安裝步驟，目的是將 GitHub 的軟體庫加入到我們的系統中
# ---
# [NEW STEP] Install GitHub CLI (gh)
# These are the official installation steps to add the GitHub repository to our system.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
&& chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
&& echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
&& apt-get update \
&& apt-get install gh -y

# Step 3: 設定工作目錄
WORKDIR /workspace

# Step 4: 安裝專案依賴 (Ruby Gems)
COPY Gemfile ./
RUN bundle install

# Step 5: 安裝專案依賴 (Node.js Packages)
RUN if [ -f package.json ]; then \
    npm install; \
    fi

# Step 6: 複製整個專案
COPY . .
