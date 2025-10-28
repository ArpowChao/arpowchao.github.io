import sys
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import yfinance as yf
from PyQt6.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout, 
                             QPushButton, QTableWidget, QTableWidgetItem, QHeaderView,
                             QLabel, QFileDialog)
from PyQt6.QtCore import QObject, QThread, pyqtSignal, Qt,QDate
from PyQt6.QtGui import QColor, QBrush, QFont
from PyQt6.QtWidgets import QDateEdit
# --- 【更新】調整分類並新增 FANG, IWM, AI, 量子等標的 ---
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
    "債卷與貨幣": {
        "20年+美債ETF": "TLT",
        "垃圾債券ETF": "HYG",
        "VIX恐慌指數": "^VIX",
        "美元指數": "DX-Y.NYB",
        "歐元/美元": "EURUSD=X",
        "英鎊/美元": "GBPUSD=X",
        "日圓/美元": "JPY=X",
        "台幣/美元": "TWDUSD=X",
        "人民幣/美元": "CNYUSD=X",
    },
    "成長型": {
        "通訊服務 (IXP)": "IXP",      
        "半導體 (SOXX)": "SOXX",
        "AI科技ETF (AIQ)": "AIQ",
        "機器人與AI ETF (BOTZ)": "BOTZ",
        "量子計算ETF (QTUM)": "QTUM",
        "科技 (XLK)": "XLK",
        "工業 (XLI)": "XLI",
        "原物料 (XLB)": "XLB",
        "非必需消費品 (XLY)": "XLY"  
    },
    "價值型": {
        "能源 (XLE)": "XLE",
        "銀行 (KBWB)": "KBWB",
        "公用事業 (XLU)": "XLU",
        "房地產 (IYR)": "IYR",
        "必需消費品 (XLP)": "XLP",
        "健康照護 (XLV)": "XLV",
        "保險(IAK)":"IAK"
    },
    "大宗商品": {
        "黃金期貨": "GC=F",
        "白銀期貨": "SI=F",
        "銅期貨": "HG=F",
        "WTI原油期貨": "CL=F",
        "天然氣期貨": "NG=F",
        "玉米期貨": "ZC=F",
        "黃豆期貨": "ZS=F"
    },
    "大型科技權值股 (Mega Cap)": {
        "蘋果 (AAPL)": "AAPL",
        "微軟 (MSFT)": "MSFT",
        "谷歌 (GOOGL)": "GOOGL",
        "亞馬遜 (AMZN)": "AMZN",
        "輝達 (NVDA)": "NVDA",
        "META (原Facebook)": "META",
        "網飛 (NFLX)": "NFLX",
    },
    "其他": {
        "台積電 (TSM)": "TSM",
        "特斯拉 (TSLA)": "TSLA",
        "英特爾 (INTC)": "INTC",
        "高通 (QCOM)": "QCOM",
        "AMD (超微)": "AMD",
        "博通 (AVGO)": "AVGO",
        "美光 (MU)": "MU",
        "ASML (荷蘭晶圓廠)": "ASML",
        "Adobe (ADBE)": "ADBE",
        "Salesforce (CRM)": "CRM",
        "UNH (聯合健康)": "UNH",
        "Visa (V)": "V",
    }
}

# --- 深色模式顏色與樣式表 (維持不變) ---
DARK_BACKGROUND_COLOR = '#2E2E2E'
DARK_TEXT_COLOR = '#E0E0E0'
DARK_GRID_COLOR = '#454545'
DARK_HEADER_COLOR = '#3A3A3A'
POSITIVE_COLOR = QColor("#50C878")
NEGATIVE_COLOR = QColor("#FF5733")
TOP_BG_COLOR = QBrush(QColor(80, 80, 30, 150))
BOTTOM_BG_COLOR = QBrush(QColor(80, 30, 30, 150))
DARK_MODE_STYLESHEET = f""" QWidget {{ background-color: {DARK_BACKGROUND_COLOR}; color: {DARK_TEXT_COLOR}; font-family: 'Microsoft JhengHei UI'; font-size: 10pt; }} QHeaderView::section {{ background-color: {DARK_HEADER_COLOR}; padding: 4px; border: 1px solid {DARK_GRID_COLOR}; }} QTableWidget {{ gridline-color: {DARK_GRID_COLOR}; }} QPushButton {{ background-color: {DARK_HEADER_COLOR}; border: 1px solid {DARK_GRID_COLOR}; padding: 5px; }} QPushButton:hover {{ background-color: #4A4A4A; }} QPushButton:pressed {{ background-color: #5A5A5A; }} """

def get_all_tickers(categorized_tickers):
    return [ticker for category in categorized_tickers.values() for ticker in category.values()]
def calc_rsi(series, period=14):
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    return rsi
class DataWorker(QObject):
    finished = pyqtSignal(pd.DataFrame)
    progress = pyqtSignal(str)
    def __init__(self, target_date=None):
        super().__init__()
        self.target_date = target_date  # 新增    
    def run(self):
        tickers = get_all_tickers(CATEGORIZED_TICKERS)
        self.progress.emit(f"🔍 正在抓取 {len(tickers)} 個標的的每日數據...")
        # 用 self.target_date，如果沒給就用今天
        today = self.target_date or datetime.now()
        start_of_last_year = today.replace(year=today.year - 1, month=1, day=1)
        start_str = start_of_last_year.strftime('%Y-%m-%d')
        end_str = (today + timedelta(days=1)).strftime('%Y-%m-%d')
        try:
            daily_data = yf.download(tickers, start=start_str, end=end_str, group_by='ticker', auto_adjust=True)
            self.progress.emit("🔍 數據下載完畢，正在進行計算...")
            results = []
            reverse_ticker_map = {v: k for category in CATEGORIZED_TICKERS.values() for k, v in category.items()}
            last_day_of_last_year = today.replace(year=today.year - 1, month=12, day=31)
            for ticker in tickers:
                if ticker not in daily_data.columns.levels[0]: continue
                hist = daily_data[ticker].dropna()
                if len(hist) < 15: continue  # 至少要有14+1天
                last_price = hist['Close'].iloc[-1]
                day_change = (last_price / hist['Close'].iloc[-2] - 1) * 100
                price_7_days_ago = hist['Close'].asof(today - timedelta(days=7))
                week_change = (last_price / price_7_days_ago - 1) * 100 if price_7_days_ago else 0
                price_30_days_ago = hist['Close'].asof(today - timedelta(days=30))
                month_change = (last_price / price_30_days_ago - 1) * 100 if price_30_days_ago else 0
                price_ytd_start = hist['Close'].asof(last_day_of_last_year)
                ytd_change = (last_price / price_ytd_start - 1) * 100 if price_ytd_start else 0
                # 新增RSI
                rsi = calc_rsi(hist['Close']).iloc[-1]
                name = reverse_ticker_map.get(ticker, ticker)
                results.append({
                    "ticker": ticker, "name": name, "price": last_price,
                    "day": day_change, "week": week_change, "month": month_change, "ytd": ytd_change,
                    "rsi": rsi
                })
            df = pd.DataFrame(results)
            self.finished.emit(df)
        except Exception as e:
            self.progress.emit(f"❌ 發生錯誤: {e}")
            self.finished.emit(pd.DataFrame())

class MarketMonitorApp(QWidget):
    def __init__(self):
        super().__init__()
        # 設定預設儲存資料夾
        self.last_dir = r"D:/Arpow Google/投資/市場交易邏輯線"
        self.df = pd.DataFrame()
        self.initUI()

    def initUI(self):
        self.setWindowTitle("市場綜合儀表板 (v1.2)")
        self.setGeometry(100, 100, 1000, 800) # 寬度可以稍微調回來
        
        vbox = QVBoxLayout()
        hbox = QHBoxLayout()
        self.run_button = QPushButton("🚀 開始監測")
        self.run_button.clicked.connect(self.start_fetch)
        self.export_button = QPushButton("📄 匯出至 Excel")
        self.export_button.clicked.connect(self.export_to_excel)
        self.export_button.setEnabled(False)

        # 新增：日期選擇器
        self.date_edit = QDateEdit()
        self.date_edit.setDate(QDate.currentDate())
        self.date_edit.setCalendarPopup(True)
        hbox.addWidget(QLabel("匯出日期："))
        hbox.addWidget(self.date_edit)

        hbox.addWidget(self.run_button)
        hbox.addWidget(self.export_button)
        hbox.addStretch(1)
        vbox.addLayout(hbox)

        # 新增：預設儲存位置顯示
        self.save_dir_label = QLabel(f"預設儲存位置：{self.last_dir}")
        vbox.addWidget(self.save_dir_label)

        self.table = QTableWidget()
        # --- 【更新】移除 'year' 欄位 ---
        # ...existing code...
        self.column_keys = ["name", "price", "day", "week", "month", "ytd", "rsi"]
        self.column_headers = ["監測標的", "目前價位", "1天 (%)", "1週 (%)", "1個月 (%)", "YTD (%)", "RSI(14)"]
        # ...existing code...
        self.table.setColumnCount(len(self.column_headers))
        self.table.setHorizontalHeaderLabels(self.column_headers)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        vbox.addWidget(self.table)
        
        self.status_bar = QLabel("準備就緒。請點擊 '開始監測'。")
        vbox.addWidget(self.status_bar)
        self.setLayout(vbox)
    # ...existing code...
    def export_to_excel(self):
        if self.df is None or self.df.empty: return
        export_df = self.df.reset_index().copy()
        ticker_to_category_map = {v: k for k, tickers in CATEGORIZED_TICKERS.items() for v in tickers.values()}
        export_df['分類'] = export_df['ticker'].map(ticker_to_category_map)
        export_df.rename(columns={
            'name': '監測標的', 'price': '收盤價', 'day': '1天 (%)', 'week': '1週 (%)',
            'month': '1個月 (%)', 'ytd': 'YTD (%)'
        }, inplace=True)
        ordered_df = export_df[["分類", "監測標的", "ticker", "收盤價", "1天 (%)", "1週 (%)", "1個月 (%)", "YTD (%)", "rsi"]]
        # 依照選擇的日期命名
        selected_date = self.date_edit.date().toString("yyyyMMdd")
        default_filename = f"market_data_{selected_date}.xlsx"
        import os
        initial_path = os.path.join(self.last_dir, default_filename) if self.last_dir else default_filename
        file_path, _ = QFileDialog.getSaveFileName(
            self, "儲存 Excel 檔案",
            initial_path,
            "Excel Files (*.xlsx)"
        )
        if file_path:
            self.last_dir = os.path.dirname(file_path)
            self.save_dir_label.setText(f"預設儲存位置：{self.last_dir}")
            try:
                ordered_df.to_excel(file_path, index=False, engine='openpyxl')
                self.status_bar.setText(f"🎉 成功匯出至: {file_path}")
            except Exception as e:
                self.status_bar.setText(f"❌ 匯出失敗: {e}")
    def start_fetch(self):
        self.run_button.setEnabled(False)
        self.export_button.setEnabled(False)
        self.status_bar.setText("🔍 正在初始化...")

        self.thread = QThread()
        # 取得 UI 選擇的日期
        qdate = self.date_edit.date()
        target_date = datetime(qdate.year(), qdate.month(), qdate.day())
        self.worker = DataWorker(target_date=target_date)  # 傳入
        self.worker.moveToThread(self.thread)
        self.thread.started.connect(self.worker.run)
        self.worker.finished.connect(self.update_table)
        self.worker.progress.connect(self.status_bar.setText)
        self.worker.finished.connect(self.thread.quit)
        self.worker.finished.connect(self.worker.deleteLater)
        self.thread.finished.connect(self.thread.deleteLater)
        self.thread.start()

    def update_table(self, df):
            if df.empty:
                self.status_bar.setText("❌ 數據抓取或計算失敗。")
                self.run_button.setEnabled(True)
                return
            
            self.df = df.set_index('ticker')
            self.table.setRowCount(0)

            rankings = {col: {'top3': self.df[col].nlargest(3).index, 'bottom3': self.df[col].nsmallest(3).index}
                        for col in ['day', 'week', 'month', 'ytd']}
            
            current_row = 0
            bold_font = QFont()
            bold_font.setBold(True)
            white_color = QColor("white")

            for category, tickers_dict in CATEGORIZED_TICKERS.items():
                self.table.insertRow(current_row)
                category_item = QTableWidgetItem(f"▼ {category}")
                category_item.setFont(bold_font)
                category_item.setBackground(QBrush(QColor('#4A4A4A')))
                # 分類標題靠左
                category_item.setTextAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
                self.table.setItem(current_row, 0, category_item)
                self.table.setSpan(current_row, 0, 1, self.table.columnCount())
                current_row += 1
                
                for name, ticker in tickers_dict.items():
                    if ticker in self.df.index:
                        row_data = self.df.loc[ticker]
                        self.table.insertRow(current_row)
                        for col_idx, key in enumerate(self.column_keys):
                            value = row_data[key]

                            if isinstance(value, float) and key == 'price':
                                item = QTableWidgetItem(f"{value:.4f}")
                            elif isinstance(value, float):
                                item = QTableWidgetItem(f"{value:.2f}")
                            else:
                                item = QTableWidgetItem(str(value))

                            item.setFont(bold_font)

                            # --- 【核心修正】根據欄位類型設定文字對齊 ---
                            if key == 'name':
                                item.setTextAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
                            else:
                                item.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)

                            # 設定文字顏色
                            if key == 'price':
                                item.setForeground(white_color)
                            elif key == 'rsi' and isinstance(value, float):
                                if value > 70:
                                    item.setForeground(QColor("#1DE9B6"))
                                elif value < 30:
                                    item.setForeground(QColor("#C77DFF"))
                            elif isinstance(value, float):
                                if value > 0: item.setForeground(POSITIVE_COLOR)
                                elif value < 0: item.setForeground(NEGATIVE_COLOR)

                            # 設定背景高光
                            if isinstance(value, float) and key in rankings:
                                if ticker in rankings[key]['top3']: item.setBackground(TOP_BG_COLOR)
                                elif ticker in rankings[key]['bottom3']: item.setBackground(BOTTOM_BG_COLOR)

                            self.table.setItem(current_row, col_idx, item)
                        current_row += 1

            self.table.resizeColumnsToContents()
            self.status_bar.setText(f"✅ 數據更新完畢！共顯示 {len(self.df)} 筆資料。")
            self.run_button.setEnabled(True)
            self.export_button.setEnabled(True)


if __name__ == '__main__':
    # 檢查必要套件
    try:
        from PyQt6.QtWidgets import QApplication
        import curl_cffi
    except ImportError:
        print("偵測到缺少必要的函式庫。")
        print("請在您的終端機執行: pip install PyQt6 curl_cffi")
        sys.exit()
        
    app = QApplication(sys.argv)
    app.setStyleSheet(DARK_MODE_STYLESHEET)
    ex = MarketMonitorApp()
    ex.show()
    sys.exit(app.exec())