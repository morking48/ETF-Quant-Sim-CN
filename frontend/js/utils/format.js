/**
 * 格式化工具函数
 */

/**
 * 数字千分位格式化
 */
function formatNumber(num, decimals = 2) {
    if (num == null || isNaN(num)) return '-';
    return Number(num).toLocaleString('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * 百分比格式化
 */
function formatPercent(num, decimals = 1) {
    if (num == null || isNaN(num)) return '-';
    const val = Number(num);
    const sign = val >= 0 ? '+' : '';
    return sign + val.toFixed(decimals) + '%';
}

/**
 * 信号级别 → 显示文本和图标
 */
function getSignalInfo(cp) {
    if (cp == null) return { level: 'NORMAL', icon: '⚪', label: '无数据', cssClass: 'normal', color: '#94a3b8' };
    if (cp >= 70) return { level: 'HIGH', icon: '🔴', label: '高确信', cssClass: 'high', color: '#ef4444' };
    if (cp >= 50) return { level: 'MID', icon: '🟡', label: '中等', cssClass: 'mid', color: '#f59e0b' };
    return { level: 'NORMAL', icon: '⚪', label: '正常', cssClass: 'normal', color: '#22c55e' };
}

/**
 * 涨跌幅颜色类名
 */
function getChgColorClass(chg) {
    if (chg == null) return 'color-neutral';
    if (chg > 0) return 'color-up';
    if (chg < 0) return 'color-down';
    return 'color-neutral';
}

/**
 * 时间戳格式化
 */
function formatTime(isoStr) {
    if (!isoStr) return '--';
    const d = new Date(isoStr);
    return d.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}