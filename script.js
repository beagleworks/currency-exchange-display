// 設定とデータ定義
const CONFIG = {
    API_BASE_URL: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies',
    CACHE_TIMEOUT: 24 * 60 * 60 * 1000, // 24時間
    MULTIPLIERS: [1, 10, 100, 1000, 10000]
};

// 対応通貨リスト
const SUPPORTED_CURRENCIES = [
    { code: 'jpy', name: '日本円', symbol: '¥' },
    { code: 'usd', name: '米ドル', symbol: '$' },
    { code: 'eur', name: 'ユーロ', symbol: '€' },
    { code: 'gbp', name: '英ポンド', symbol: '£' },
    { code: 'aud', name: '豪ドル', symbol: 'A$' },
    { code: 'cad', name: 'カナダドル', symbol: 'C$' },
    { code: 'chf', name: 'スイスフラン', symbol: 'CHF' },
    { code: 'cny', name: '中国元', symbol: '¥' },
    { code: 'krw', name: '韓国ウォン', symbol: '₩' }
];

// グローバル状態管理
let appState = {
    rates: {},
    baseCurrency: 'jpy',
    multiplier: 1,
    lastUpdated: null,
    isLoading: false
};

// キャッシュ管理
const exchangeRateCache = new Map();

// ===============================
// API統合機能
// ===============================

/**
 * 特定通貨の為替レートを取得する
 * @param {string} baseCurrency - 基準通貨
 * @returns {Promise<Object>} レートデータ
 */
async function getCurrencyRates(baseCurrency) {
    const url = `${CONFIG.API_BASE_URL}/${baseCurrency}.json`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`API呼び出しエラー: ${response.status}`);
    }
    
    return response.json();
}

/**
 * キャッシュ付きで為替レートを取得する
 * @param {string} baseCurrency - 基準通貨
 * @returns {Promise<Object>} レートデータとタイムスタンプ
 */
async function getRates(baseCurrency = 'jpy') {
    const cacheKey = baseCurrency;
    const cached = exchangeRateCache.get(cacheKey);
    
    // キャッシュチェック
    if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_TIMEOUT) {
        // キャッシュからデータを読み込む場合、キャッシュの取得日時を使用
        return {
            data: cached.data,
            timestamp: cached.timestamp, // キャッシュされた時刻を最終更新日時として使用
            fromCache: true
        };
    }
    
    try {
        const data = await getCurrencyRates(baseCurrency);
        const rates = data[baseCurrency];
        const timestamp = Date.now();
        
        // キャッシュに保存
        exchangeRateCache.set(cacheKey, {
            data: rates,
            timestamp: timestamp
        });
        
        return {
            data: rates,
            timestamp: timestamp,
            fromCache: false
        };
    } catch (error) {
        console.error('為替レート取得エラー:', error);
        
        // キャッシュがあれば古いデータを返す
        if (cached) {
            console.warn('古いキャッシュデータを使用します');
            return {
                data: cached.data,
                timestamp: cached.timestamp, // キャッシュされた時刻を最終更新日時として使用
                fromCache: true
            };
        }
        
        throw error;
    }
}

// ===============================
// 為替レート表示機能
// ===============================

/**
 * 双方向レートを計算する
 * @param {string} baseCurrency - 基準通貨
 * @param {string} targetCurrency - 対象通貨
 * @param {Object} rates - レートデータ
 * @param {number} multiplier - 倍数
 * @returns {Object} 双方向レート情報
 */
function calculateBidirectionalRates(baseCurrency, targetCurrency, rates, multiplier = 1) {
    if (!rates[targetCurrency]) {
        return null;
    }
    
    const baseToTarget = rates[targetCurrency] * multiplier;
    const targetToBase = (1 / rates[targetCurrency]) * multiplier;
    
    return {
        forward: {
            from: baseCurrency,
            to: targetCurrency,
            rate: baseToTarget,
            display: formatRateDisplay(baseToTarget, targetCurrency)
        },
        reverse: {
            from: targetCurrency,
            to: baseCurrency,
            rate: targetToBase,
            display: formatRateDisplay(targetToBase, baseCurrency)
        }
    };
}

/**
 * レート表示をフォーマットする
 * @param {number} rate - レート値
 * @param {string} currencyCode - 通貨コード
 * @returns {string} フォーマット済み文字列
 */
function formatRateDisplay(rate, currencyCode) {
    const currency = SUPPORTED_CURRENCIES.find(c => c.code === currencyCode);
    const symbol = currency ? currency.symbol : currencyCode.toUpperCase();
    
    // 適切な小数点桁数を決定
    let precision = 4;
    if (rate > 100) precision = 2;
    else if (rate > 10) precision = 3;
    else if (rate < 0.01) precision = 6;
    
    const formattedRate = rate.toFixed(precision);
    return `${addCommasToNumber(formattedRate)} ${symbol}`;
}

/**
 * 数値に桁区切りカンマを追加する
 * @param {string} numStr - 数値文字列
 * @returns {string} カンマ区切り文字列
 */
function addCommasToNumber(numStr) {
    const parts = numStr.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
}

/**
 * 為替レート表を更新する
 */
async function updateRateTable() {
    const ratesLoading = document.getElementById('ratesLoading');
    const ratesError = document.getElementById('ratesError');
    const rateTable = document.getElementById('rateTable');
    const rateTableBody = document.getElementById('rateTableBody');
    const forwardRateHeader = document.getElementById('forwardRateHeader');
    const reverseRateHeader = document.getElementById('reverseRateHeader');
    
    try {
        // ローディング状態表示
        appState.isLoading = true;
        ratesLoading.style.display = 'block';
        ratesError.style.display = 'none';
        rateTable.style.display = 'none';
        
        // レート取得
        const rateResult = await getRates(appState.baseCurrency);
        appState.rates = rateResult.data;
        // キャッシュから読み込んだ場合はキャッシュの取得日時を使用
        appState.lastUpdated = new Date(rateResult.timestamp);
        
        // テーブルヘッダー更新
        const baseCurrencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === appState.baseCurrency);
        const baseCurrencyName = baseCurrencyInfo ? baseCurrencyInfo.name : appState.baseCurrency.toUpperCase();
        
        forwardRateHeader.textContent = `${appState.multiplier} ${baseCurrencyName} =`;
        reverseRateHeader.textContent = `1 通貨 = ${baseCurrencyName}`;
        
        // テーブル本体をクリア
        rateTableBody.innerHTML = '';
        
        // 各通貨の行を生成
        SUPPORTED_CURRENCIES.forEach(currency => {
            if (currency.code === appState.baseCurrency) return;
            
            const bidirectionalRates = calculateBidirectionalRates(
                appState.baseCurrency,
                currency.code,
                appState.rates,
                appState.multiplier
            );
            
            if (bidirectionalRates) {
                const row = createRateTableRow(currency, bidirectionalRates);
                rateTableBody.appendChild(row);
            }
        });
        
        // 表示切り替え
        ratesLoading.style.display = 'none';
        rateTable.style.display = 'table';
        
        // フッターの最終更新時刻を更新（キャッシュ状態を考慮）
        updateFooterLastUpdate(rateResult.fromCache);
        
    } catch (error) {
        console.error('レート表更新エラー:', error);
        
        // エラー表示
        ratesLoading.style.display = 'none';
        ratesError.style.display = 'block';
        ratesError.textContent = `為替レートの取得に失敗しました: ${error.message}`;
        
    } finally {
        appState.isLoading = false;
    }
}

/**
 * レート表の行を作成する
 * @param {Object} currency - 通貨情報
 * @param {Object} bidirectionalRates - 双方向レート
 * @returns {HTMLElement} テーブル行要素
 */
function createRateTableRow(currency, bidirectionalRates) {
    const row = document.createElement('tr');
    
    row.innerHTML = `
        <td>
            <div class="currency-name">${currency.name}</div>
            <div class="currency-code">${currency.code.toUpperCase()}</div>
        </td>
        <td class="rate-value">${bidirectionalRates.forward.display}</td>
        <td class="rate-value">${bidirectionalRates.reverse.display}</td>
    `;
    
    return row;
}

// ===============================
// 通貨換算機能
// ===============================

/**
 * 通貨換算を実行する
 * @param {string} fromCurrency - 換算元通貨
 * @param {string} toCurrency - 換算先通貨
 * @param {number} amount - 金額
 * @param {Object} rates - レートデータ
 * @returns {Object} 換算結果
 */
function calculateConversion(fromCurrency, toCurrency, amount, rates) {
    if (fromCurrency === toCurrency) {
        return {
            result: amount,
            rate: 1
        };
    }
    
    // JPYベースでの換算計算
    let jpyAmount;
    let exchangeRate;
    
    if (fromCurrency === 'jpy') {
        jpyAmount = amount;
        exchangeRate = rates[toCurrency];
    } else {
        jpyAmount = amount / rates[fromCurrency];
        exchangeRate = rates[toCurrency] / rates[fromCurrency];
    }
    
    let result;
    if (toCurrency === 'jpy') {
        result = jpyAmount;
        exchangeRate = 1 / rates[fromCurrency];
    } else {
        result = jpyAmount * rates[toCurrency];
    }
    
    return {
        result: result,
        rate: exchangeRate
    };
}

/**
 * 通貨換算を実行し、UIを更新する
 */
async function performCurrencyConversion() {
    const fromAmount = document.getElementById('fromAmount');
    const toAmount = document.getElementById('toAmount');
    const fromCurrency = document.getElementById('fromCurrency');
    const toCurrency = document.getElementById('toCurrency');
    const conversionInfo = document.getElementById('conversionInfo');
    const exchangeRateInfo = document.getElementById('exchangeRateInfo');
    const lastUpdated = document.getElementById('lastUpdated');
    
    const amount = parseFloat(fromAmount.value);
    
    if (!amount || amount <= 0) {
        toAmount.value = '';
        conversionInfo.style.display = 'none';
        return;
    }
    
    try {
        // 基準通貨がJPYでない場合は、JPYベースのレートを取得
        let rates = appState.rates;
        if (Object.keys(rates).length === 0 || appState.baseCurrency !== 'jpy') {
            const rateResult = await getRates('jpy');
            rates = rateResult.data;
        }
        
        const conversion = calculateConversion(
            fromCurrency.value,
            toCurrency.value,
            amount,
            rates
        );
        
        // 結果表示
        toAmount.value = conversion.result.toFixed(6).replace(/\.?0+$/, '');
        
        // 為替レート情報表示
        const fromCurrencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === fromCurrency.value);
        const toCurrencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === toCurrency.value);
        
        exchangeRateInfo.textContent = 
            `1 ${fromCurrencyInfo.name} = ${conversion.rate.toFixed(6).replace(/\.?0+$/, '')} ${toCurrencyInfo.name}`;
        
        lastUpdated.textContent = `更新日時: ${new Date().toLocaleString('ja-JP')}`;
        conversionInfo.style.display = 'block';
        
    } catch (error) {
        console.error('通貨換算エラー:', error);
        toAmount.value = 'エラー';
        conversionInfo.style.display = 'none';
    }
}

// ===============================
// イベントハンドラー
// ===============================

/**
 * DOMが読み込まれた時の初期化処理
 */
document.addEventListener('DOMContentLoaded', function() {
    // 初期データ読み込み
    updateRateTable();
    
    // フッターの初期時刻設定（初期化時はキャッシュではない）
    updateFooterLastUpdate(false);
    
    // 基準通貨選択のイベントリスナー
    const baseCurrencySelect = document.getElementById('baseCurrency');
    baseCurrencySelect.addEventListener('change', function() {
        appState.baseCurrency = this.value;
        updateRateTable();
    });
    
    // 倍数ボタンのイベントリスナー
    const multiplierButtons = document.querySelectorAll('.multiplier-btn');
    multiplierButtons.forEach(button => {
        button.addEventListener('click', function() {
            // アクティブ状態を更新
            multiplierButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // 倍数を更新
            appState.multiplier = parseInt(this.dataset.multiplier);
            updateRateTable();
        });
    });
    
    // 通貨換算のイベントリスナー
    const fromAmount = document.getElementById('fromAmount');
    const fromCurrency = document.getElementById('fromCurrency');
    const toCurrency = document.getElementById('toCurrency');
    
    fromAmount.addEventListener('input', performCurrencyConversion);
    fromCurrency.addEventListener('change', performCurrencyConversion);
    toCurrency.addEventListener('change', performCurrencyConversion);
    
    // 通貨入れ替えボタン
    const swapButton = document.getElementById('swapCurrencies');
    swapButton.addEventListener('click', function() {
        const fromCurrencyValue = fromCurrency.value;
        const toCurrencyValue = toCurrency.value;
        
        fromCurrency.value = toCurrencyValue;
        toCurrency.value = fromCurrencyValue;
        
        performCurrencyConversion();
    });
    
    // デバウンス処理で入力遅延を最適化
    let conversionTimeout;
    fromAmount.addEventListener('input', function() {
        clearTimeout(conversionTimeout);
        conversionTimeout = setTimeout(performCurrencyConversion, 300);
    });
});

// ===============================
// ユーティリティ関数
// ===============================

/**
 * 最適な倍数を提案する
 * @param {number} rate - レート値
 * @returns {number} 最適な倍数
 */
function getOptimalMultiplier(rate) {
    if (rate < 0.01) return 10000;
    if (rate < 0.1) return 1000;
    if (rate < 1) return 100;
    if (rate < 10) return 10;
    return 1;
}

/**
 * エラー表示用ヘルパー関数
 * @param {string} message - エラーメッセージ
 */
function showError(message) {
    const errorElement = document.getElementById('ratesError');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

/**
 * ローディング状態の表示/非表示
 * @param {boolean} isLoading - ローディング状態
 */
function setLoadingState(isLoading) {
    const loadingElement = document.getElementById('ratesLoading');
    const tableElement = document.getElementById('rateTable');
    
    if (isLoading) {
        loadingElement.style.display = 'block';
        tableElement.style.display = 'none';
    } else {
        loadingElement.style.display = 'none';
        tableElement.style.display = 'table';
    }
}

/**
 * フッターの最終更新時刻を更新する
 * @param {boolean} fromCache - キャッシュからのデータかどうか
 */
function updateFooterLastUpdate(fromCache = false) {
    const footerLastUpdate = document.getElementById('footerLastUpdate');
    if (footerLastUpdate && appState.lastUpdated) {
        const formattedTime = appState.lastUpdated.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const updateText = footerLastUpdate.querySelector('.footer__update-text');
        if (updateText) {
            // キャッシュから読み込んだ場合はキャッシュの取得日時を表示
            const cacheIndicator = fromCache ? ' (キャッシュ)' : '';
            updateText.textContent = `最終更新: ${formattedTime}${cacheIndicator}`;
        }
    }
}