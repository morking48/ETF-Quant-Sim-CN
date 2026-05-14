/**
 * 通用UI组件
 */

/**
 * 创建信号徽章 HTML
 */
function createSignalBadge(cp) {
    const info = getSignalInfo(cp);
    return `<span class="signal-badge ${info.cssClass}">${info.icon} ${info.label}</span>`;
}

/**
 * 创建 ETF 卡片 (仪表盘用)
 */
function createETFCard(etfData) {
    const { code, name, index, latest, error } = etfData;
    
    if (error || !latest) {
        return `
            <div class="etf-card signal-normal">
                <div class="card-header">
                    <div>
                        <div class="card-code">${code}</div>
                        <div class="card-name">${name}</div>
                    </div>
                    <div class="card-signal">⚪</div>
                </div>
                <div class="card-prob">
                    <div class="card-prob-value" style="color: var(--text-muted);">--</div>
                    <div class="card-prob-label">${error || '数据不可用'}</div>
                </div>
            </div>`;
    }

    const si = getSignalInfo(latest.cp);
    const chgClass = getChgColorClass(latest.chg);
    
    return `
        <div class="etf-card signal-${si.cssClass}" onclick="switchToDetail('${code}')">
            <div class="card-header">
                <div>
                    <div class="card-code">${code}</div>
                    <div class="card-name">${name}</div>
                </div>
                <div class="card-signal">${si.icon}</div>
            </div>
            <div class="card-prob">
                <div class="card-prob-value" style="color:${si.color}">${latest.cp.toFixed(0)}%</div>
                <div class="card-prob-label">综合概率 · ${si.label}</div>
            </div>
            <div class="card-factors">
                <div class="card-factor">
                    <span>量能P</span><span>${latest.vp.toFixed(0)}%</span>
                </div>
                <div class="card-factor">
                    <span>方向P</span><span>${latest.dp.toFixed(0)}%</span>
                </div>
                <div class="card-factor">
                    <span>份额P</span><span>${latest.sp != null ? latest.sp.toFixed(0) + '%' : '--'}</span>
                </div>
                <div class="card-factor">
                    <span>倍量</span><span>${latest.vr.toFixed(2)}x</span>
                </div>
                <div class="card-factor">
                    <span>涨跌</span><span class="${chgClass}">${formatPercent(latest.chg)}</span>
                </div>
            </div>
            <div class="card-chg">
                <span>涨跌 <span class="${chgClass}">${formatPercent(latest.chg)}</span></span>
                <span class="card-chg-price">¥${latest.c.toFixed(3)}</span>
            </div>
        </div>`;
}

/**
 * 创建汇总卡片
 */
function createSummaryCard(type, value, label, color) {
    return `
        <div class="summary-card">
            <div class="sc-value" style="color:${color}">${value}</div>
            <div class="sc-label">${label}</div>
        </div>`;
}

/**
 * 创建加载遮罩
 */
function showLoading() {
    // 先移除旧的
    hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = '<div class="loading-spinner"></div>';
    document.body.appendChild(overlay);
}

function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.remove();
}

/**
 * 显示错误横幅
 */
function showError(msg) {
    const container = document.querySelector('.tab-content');
    const existing = document.querySelector('.error-banner');
    if (existing) existing.remove();
    
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.textContent = `⚠️ ${msg}`;
    container.insertBefore(banner, container.firstChild);
    
    // 5秒后自动消失
    setTimeout(() => banner.remove(), 5000);
}

/**
 * 更新顶部状态栏时间
 */
function updateHeaderTime(timeStr, dateStr) {
    document.getElementById('headerTime').textContent = timeStr || '--';
    document.getElementById('headerDate').textContent = dateStr || '--';
}

function setStatusDot(state) {
    const dot = document.getElementById('statusDot');
    dot.className = 'header-status';
    if (state === 'loading') dot.classList.add('loading');
    else if (state === 'error') dot.classList.add('error');
}