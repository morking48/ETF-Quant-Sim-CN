/**
 * 日期工具函数
 */

/**
 * 格式化日期 YYYY-MM-DD
 */
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * 解析日期字符串 "YYYY-MM-DD" → Date
 */
function parseDate(str) {
    const parts = str.split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
}

/**
 * 获取最近一个交易日
 * 简单规则：周一到周五看今天，周末看上周五
 */
function getLatestTradeDate() {
    const now = new Date();
    const day = now.getDay(); // 0=周日, 6=周六
    let offset = 0;
    if (day === 0) offset = 2; // 周日 → 周五
    else if (day === 6) offset = 1; // 周六 → 周五
    
    const tradeDay = new Date(now);
    tradeDay.setDate(tradeDay.getDate() - offset);
    return formatDate(tradeDay);
}

/**
 * 获取过去 N 个自然日的日期列表
 */
function getRecentDates(n) {
    const dates = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dates.push(formatDate(d));
    }
    return dates;
}

/**
 * 简短日期显示 MM-DD
 */
function shortDate(dateStr) {
    if (!dateStr || dateStr.length < 10) return dateStr;
    return dateStr.slice(5);
}