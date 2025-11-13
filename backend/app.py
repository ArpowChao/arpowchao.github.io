from flask import Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os

app = Flask(__name__)
CORS(app)
app = Flask(__name__)
CORS(app)

# ==================== 資料配置 ====================
CATEGORIZED_TICKERS = {
    "大盤指數": {
        "標普500指數": "^GSPC",
        "納斯達克指數": "^IXIC",
        "道瓊工業指數": "^DJI",
        "羅素2000指數": "^RUT",
        "FAANG (七巨頭)": "^NYFANG",
        "BTC比特幣": "BTC-USD",
        "ETH以太幣": "ETH-USD",
    },
    "ETF指數": {
        "標普500 ETF (SPY)": "SPY",
        "納斯達克100 ETF (QQQ)": "QQQ",
        "羅素2000 ETF (IWM)": "IWM",
        "羅素1000價值 ETF (IWD)": "IWD",
        "羅素1000成長 ETF (IWF)": "IWF",
        "趨勢板塊 ETF (MTUM)": "MTUM",
    },
    "債券與貨幣": {
        "20年+美債ETF": "TLT",
        "垃圾債券ETF": "HYG",
        "VIX恐慌指數": "^VIX",
        "美元指數": "DX-Y.NYB",
        "歐元/美元": "EURUSD=X",
        "英鎊/美元": "GBPUSD=X",
    },
    "成長型": {
        "通訊服務 (IXP)": "IXP",
        "半導體 (SOXX)": "SOXX",
        "AI科技ETF (AIQ)": "AIQ",
        "機器人與AI ETF (BOTZ)": "BOTZ",
        "科技 (XLK)": "XLK",
    },
    "價值型": {
        "能源 (XLE)": "XLE",
        "銀行 (KBWB)": "KBWB",
        "公用事業 (XLU)": "XLU",
        "房地產 (IYR)": "IYR",
    },
    "大宗商品": {
        "黃金期貨": "GC=F",
        "白銀期貨": "SI=F",
        "銅期貨": "HG=F",
        "WTI原油期貨": "CL=F",
    },
    "大型科技權值股": {
        "蘋果 (AAPL)": "AAPL",
        "微軟 (MSFT)": "MSFT",
        "谷歌 (GOOGL)": "GOOGL",
        "亞馬遜 (AMZN)": "AMZN",
        "輝達 (NVDA)": "NVDA",
    },
    "其他": {
        "台積電 (TSM)": "TSM",
        "特斯拉 (TSLA)": "TSLA",
        "英特爾 (INTC)": "INTC",
    }
}

# ==================== 工具函數 ====================

def calculate_rsi(prices, period=14):
    """計算 RSI 指標"""
    if len(prices) < period + 1:
        return None
    
    deltas = np.diff(prices)
    seed = deltas[:period + 1]
    up = seed[seed >= 0].sum() / period
    down = -seed[seed < 0].sum() / period
    rs = up / down if down != 0 else 0
    rsi = 100 - (100 / (1 + rs))
    return rsi

def get_stock_data(ticker, days_back=365):
    """從 Yahoo Finance 獲取股票數據"""
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        
        df = yf.download(ticker, start=start_date, end=end_date, progress=False)
        
        if df.empty:
            return None
        
        # 獲取最新價格
        current_price = df['Close'].iloc[-1]
        
        # 計算各時間段漲跌幅
        day_change = ((df['Close'].iloc[-1] - df['Close'].iloc[-2]) / df['Close'].iloc[-2] * 100) if len(df) > 1 else 0
        
        week_ago_idx = max(0, len(df) - 5)
        week_change = ((df['Close'].iloc[-1] - df['Close'].iloc[week_ago_idx]) / df['Close'].iloc[week_ago_idx] * 100) if len(df) > 5 else 0
        
        month_ago_idx = max(0, len(df) - 21)
        month_change = ((df['Close'].iloc[-1] - df['Close'].iloc[month_ago_idx]) / df['Close'].iloc[month_ago_idx] * 100) if len(df) > 21 else 0
        
        year_change = ((df['Close'].iloc[-1] - df['Close'].iloc[0]) / df['Close'].iloc[0] * 100) if len(df) > 0 else 0
        
        # 計算 RSI
        rsi = calculate_rsi(df['Close'].values)
        
        return {
            'price': float(current_price),
            'day': float(day_change),
            'week': float(week_change),
            'month': float(month_change),
            'ytd': float(year_change),
            'rsi': float(rsi) if rsi else None
        }
    except Exception as e:
        print(f"錯誤 ({ticker}): {str(e)}")
        return None

# ==================== API 端點 ====================

@app.route('/api/stocks', methods=['GET'])
def get_all_stocks():
    """獲取所有股票數據"""
    results = {}
    
    for category, tickers_dict in CATEGORIZED_TICKERS.items():
        results[category] = {}
        
        for name, ticker in tickers_dict.items():
            print(f"正在獲取: {ticker} ({name})")
            data = get_stock_data(ticker)
            
            if data:
                results[category][ticker] = {
                    'name': name,
                    'ticker': ticker,
                    'category': category,
                    **data
                }
    
    return jsonify(results)

@app.route('/api/stock/<ticker>', methods=['GET'])
def get_single_stock(ticker):
    """獲取單個股票數據"""
    data = get_stock_data(ticker)
    if data:
        return jsonify(data)
    return jsonify({'error': '無法獲取數據'}), 404

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    # 改為監聽所有 IP 和 Render 指定的端口
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
