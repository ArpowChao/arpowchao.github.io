(() => {
    const { useState, useCallback, useMemo, Fragment, FC } = React;

    // From constants.ts
    const CATEGORIZED_TICKERS = {
        "大盤指數": { "標普500指數": "^GSPC", "納斯克指數": "^IXIC", "道瓊工業指數": "^DJI", "羅素2000指數": "^RUT", "FAANG (七巨頭)": "^NYFANG", "BTC比特幣": "BTC-USD", "ETH以太幣": "ETH-USD" },
        "ETF指數": { "標普500 ETF (SPY)": "SPY", "納斯達克100 ETF (QQQ)": "QQQ", "羅素2000 ETF (IWM)": "IWM", "羅素1000價值 ETF (IWD)": "IWD", "羅素1000成長 ETF (IWF)": "IWF", "趨勢板塊 ETF (MTUM)": "MTUM" },
        "債卷與貨幣": { "20年+美債ETF": "TLT", "垃圾債券ETF": "HYG", "VIX恐慌指數": "^VIX", "美元指數": "DX-Y.NYB", "歐元/美元": "EURUSD=X", "英鎊/美元": "GBPUSD=X", "日圓/美元": "JPY=X", "台幣/美元": "TWDUSD=X", "人民幣/美元": "CNYUSD=X" },
        "成長型": { "通訊服務 (IXP)": "IXP", "半導體 (SOXX)": "SOXX", "AI科技ETF (AIQ)": "AIQ", "機器人與AI ETF (BOTZ)": "BOTZ", "量子計算ETF (QTUM)": "QTUM", "科技 (XLK)": "XLK", "工業 (XLI)": "XLI", "原物料 (XLB)": "XLB", "非必需消費品 (XLY)": "XLY" },
        "價值型": { "能源 (XLE)": "XLE", "銀行 (KBWB)": "KBWB", "公用事業 (XLU)": "XLU", "房地產 (IYR)": "IYR", "必需消費品 (XLP)": "XLP", "健康照護 (XLV)": "XLV", "保險(IAK)": "IAK" },
        "大宗商品": { "黃金期貨": "GC=F", "白銀期貨": "SI=F", "銅期貨": "HG=F", "WTI原油期貨": "CL=F", "天然氣期貨": "NG=F", "玉米期貨": "ZC=F", "黃豆期貨": "ZS=F" },
        "大型科技權值股 (Mega Cap)": { "蘋果 (AAPL)": "AAPL", "微軟 (MSFT)": "MSFT", "谷歌 (GOOGL)": "GOOGL", "亞馬遜 (AMZN)": "AMZN", "輝達 (NVDA)": "NVDA", "META (原Facebook)": "META", "網飛 (NFLX)": "NFLX" },
        "其他": { "台積電 (TSM)": "TSM", "特斯拉 (TSLA)": "TSLA", "英特爾 (INTC)": "INTC", "高通 (QCOM)": "QCOM", "AMD (超微)": "AMD", "博通 (AVGO)": "AVGO", "美光 (MU)": "MU", "ASML (荷蘭晶圓廠)": "ASML", "Adobe (ADBE)": "ADBE", "Salesforce (CRM)": "CRM", "UNH (聯合健康)": "UNH", "Visa (V)": "V" }
    };

    // From services/marketDataService.ts
    const fetchMarketData = (date) => {
        console.log(`Fetching mock data for date: ${date}`);
        return new Promise((resolve) => {
            setTimeout(() => {
                const results = [];
                const allTickers = Object.values(CATEGORIZED_TICKERS).flatMap(group => Object.entries(group));
                allTickers.forEach(([name, ticker]) => {
                    if (Math.random() > 0.05) {
                        results.push({
                            ticker, name,
                            price: parseFloat((Math.random() * 800 + 20).toFixed(4)),
                            day: parseFloat(((Math.random() - 0.5) * 8).toFixed(2)),
                            week: parseFloat(((Math.random() - 0.5) * 15).toFixed(2)),
                            month: parseFloat(((Math.random() - 0.5) * 30).toFixed(2)),
                            ytd: parseFloat(((Math.random() - 0.5) * 50).toFixed(2)),
                            rsi: parseFloat((Math.random() * 70 + 15).toFixed(2)),
                        });
                    }
                });
                resolve(results);
            }, 1500);
        });
    };
    const exportDataToExcel = (data, selectedDate) => {
        const tickerToCategoryMap = new Map();
        for (const category in CATEGORIZED_TICKERS) {
            for (const name in CATEGORIZED_TICKERS[category]) {
                const ticker = CATEGORIZED_TICKERS[category][name];
                tickerToCategoryMap.set(ticker, category);
            }
        }
        const exportData = data.map(item => ({
            '分類': tickerToCategoryMap.get(item.ticker) || '未分類', '監測標的': item.name, 'ticker': item.ticker, '收盤價': item.price,
            '1天 (%)': item.day, '1週 (%)': item.week, '1個月 (%)': item.month, 'YTD (%)': item.ytd, 'RSI(14)': item.rsi
        }));
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "MarketData");
        const formattedDate = selectedDate.replace(/-/g, '');
        const filename = `market_data_${formattedDate}.xlsx`;
        XLSX.writeFile(workbook, filename);
    };

    // From components/Spinner.tsx
    const Spinner = () => React.createElement("svg", { className: "animate-spin h-10 w-10 text-white", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24" },
        React.createElement("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
        React.createElement("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" })
    );

    // From components/Header.tsx
    const Header = ({ isLoading, onFetch, onExport, isExportDisabled, selectedDate, setSelectedDate }) => React.createElement("div", { className: "bg-gray-800 p-4 rounded-lg shadow-md flex flex-wrap items-center gap-4" },
        React.createElement("div", { className: "flex items-center gap-2" },
            React.createElement("label", { htmlFor: "date-picker", className: "text-gray-300 font-medium" }, "匯出日期："),
            React.createElement("input", { id: "date-picker", type: "date", value: selectedDate, onChange: (e) => setSelectedDate(e.target.value), className: "bg-gray-700 border border-gray-600 text-white rounded-md px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none", disabled: isLoading })
        ),
        React.createElement("button", { onClick: onFetch, disabled: isLoading, className: "flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out" },
            React.createElement("span", { className: "mr-2" }, "🚀"),
            isLoading ? '監測中...' : '開始監測'
        ),
        React.createElement("button", { onClick: onExport, disabled: isExportDisabled || isLoading, className: "flex items-center justify-center bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out" },
            React.createElement("span", { className: "mr-2" }, "📄"),
            "匯出至 Excel"
        )
    );

    // From components/StockTable.tsx
    const column_keys = ["name", "price", "day", "week", "month", "ytd", "rsi"];
    const column_headers = ["監測標的", "目前價位", "1天 (%)", "1週 (%)", "1個月 (%)", "YTD (%)", "RSI(14)"];
    const getPerformanceClass = (value) => value > 0 ? 'text-green-400' : (value < 0 ? 'text-red-400' : 'text-gray-300');
    const getRsiClass = (value) => value > 70 ? 'text-teal-400' : (value < 30 ? 'text-purple-400' : 'text-gray-300');
    const getRankingBgClass = (ticker, colKey, rankings) => {
        if (!rankings || !rankings[colKey]) return '';
        if (rankings[colKey].top3.has(ticker)) return 'bg-yellow-500/20';
        if (rankings[colKey].bottom3.has(ticker)) return 'bg-red-500/20';
        return '';
    };
    const StockTable = ({ data, rankings }) => {
        const dataMap = new Map(data.map(item => [item.ticker, item]));
        return React.createElement("div", { className: "overflow-x-auto" },
            React.createElement("table", { className: "w-full text-sm text-left text-gray-300" },
                React.createElement("thead", { className: "text-xs text-gray-300 uppercase bg-gray-700 sticky top-0" },
                    React.createElement("tr", null, column_headers.map((header, index) =>
                        React.createElement("th", { key: header, scope: "col", className: `px-4 py-3 whitespace-nowrap ${index > 0 ? 'text-right' : 'text-left'}` }, header)
                    ))
                ),
                React.createElement("tbody", null, Object.entries(CATEGORIZED_TICKERS).map(([category, tickers_dict]) =>
                    React.createElement(Fragment, { key: category },
                        React.createElement("tr", { className: "bg-gray-700/50" },
                            React.createElement("td", { colSpan: column_headers.length, className: "px-4 py-2 font-bold text-white" }, `▼ ${category}`)
                        ),
                        Object.values(tickers_dict).map(ticker => {
                            const rowData = dataMap.get(ticker);
                            if (!rowData) return null;
                            return React.createElement("tr", { key: ticker, className: "bg-gray-800 border-b border-gray-700 hover:bg-gray-700/50" },
                                column_keys.map((key) => {
                                    const value = rowData[key];
                                    const isNumericCol = key !== 'name';
                                    const rankingBg = getRankingBgClass(ticker, key, rankings);
                                    let displayValue, textColor;
                                    if (typeof value === 'number') {
                                        if (key === 'price') {
                                            displayValue = value.toFixed(4); textColor = 'text-white';
                                        } else {
                                            displayValue = value.toFixed(2); textColor = key === 'rsi' ? getRsiClass(value) : getPerformanceClass(value);
                                        }
                                    } else {
                                        displayValue = String(value); textColor = 'text-gray-200';
                                    }
                                    return React.createElement("td", { key: key, className: `px-4 py-2 font-mono whitespace-nowrap ${isNumericCol ? 'text-right' : 'text-left'} ${textColor} ${rankingBg}` }, displayValue);
                                })
                            );
                        })
                    )
                ))
            )
        );
    };

    // From App.tsx
    const App = () => {
        const [stockData, setStockData] = useState(null);
        const [isLoading, setIsLoading] = useState(false);
        const [statusMessage, setStatusMessage] = useState("準備就緒。請點擊 '開始監測'。");
        const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

        const handleFetchData = useCallback(async () => {
            setIsLoading(true);
            setStatusMessage("🔍 正在初始化...");
            try {
                const data = await fetchMarketData(selectedDate);
                setStockData(data);
                setStatusMessage(`✅ 數據更新完畢！共顯示 ${data.length} 筆資料。`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
                setStatusMessage(`❌ 數據抓取或計算失敗: ${errorMessage}`);
                setStockData(null);
            } finally {
                setIsLoading(false);
            }
        }, [selectedDate]);

        const handleExport = useCallback(() => {
            if (stockData) {
                try {
                    exportDataToExcel(stockData, selectedDate);
                    setStatusMessage(`🎉 成功匯出!`);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
                    setStatusMessage(`❌ 匯出失敗: ${errorMessage}`);
                }
            }
        }, [stockData, selectedDate]);

        const rankings = useMemo(() => {
            if (!stockData) return null;
            const rankableCols = ['day', 'week', 'month', 'ytd'];
            const result = {};
            rankableCols.forEach(col => {
                const sorted = [...stockData].filter(item => typeof item[col] === 'number').sort((a, b) => b[col] - a[col]);
                result[col] = {
                    top3: new Set(sorted.slice(0, 3).map(item => item.ticker)),
                    bottom3: new Set(sorted.slice(-3).map(item => item.ticker)),
                };
            });
            return result;
        }, [stockData]);

        return React.createElement("div", { className: "min-h-screen bg-gray-900 text-gray-200 font-sans p-4 sm:p-6 lg:p-8" },
            React.createElement("div", { className: "max-w-7xl mx-auto" },
                React.createElement("h1", { className: "text-2xl sm:text-3xl font-bold text-white mb-4" }, "市場綜合儀表板"),
                React.createElement(Header, { isLoading, onFetch: handleFetchData, onExport: handleExport, isExportDisabled: !stockData || stockData.length === 0, selectedDate, setSelectedDate }),
                React.createElement("main", { className: "mt-6 bg-gray-800 rounded-lg shadow-lg overflow-hidden" },
                    isLoading ? React.createElement("div", { className: "flex flex-col items-center justify-center h-96" },
                        React.createElement(Spinner),
                        React.createElement("p", { className: "mt-4 text-lg" }, statusMessage)
                    ) : (stockData && React.createElement(StockTable, { data: stockData, rankings }))
                ),
                React.createElement("footer", { className: "mt-4 text-center text-sm text-gray-500" },
                    React.createElement("p", null, statusMessage)
                )
            )
        );
    };

    // From index.tsx
    const rootElement = document.getElementById('root');
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(App));
})();
