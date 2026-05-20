/**
 * 网格策略专属视图：仪表盘 + 报告 + 历史
 */

function renderGridDashboard(data) {
    if (!data || !data.etfs) return;

    const etfs = data.etfs;
    const errors = etfs.filter(e => e.error).length;
    const validEtfs = etfs.filter(e => !e.error);

    // 网格专用汇总卡片（不碰三因子的renderSummaryCards）
    const highVol = validEtfs.filter(e => e.annual_vol >= 25).length;
    const midVol = validEtfs.filter(e => e.annual_vol >= 15 && e.annual_vol < 25).length;
    const lowVol = validEtfs.filter(e => e.annual_vol < 15).length;
    const rangeCount = validEtfs.filter(e => e.is_range_bound).length;

    const container = document.getElementById('summaryCards');
    const cards = [
        createSummaryCard('high', highVol, '🔴 高波动(≥25%)',
            highVol > 0 ? 'var(--signal-high)' : 'var(--text-muted)'),
        createSummaryCard('mid', midVol, '🟡 中波动(15-25%)',
            midVol > 0 ? 'var(--signal-mid)' : 'var(--text-muted)'),
        createSummaryCard('normal', lowVol, '⚪ 低波动(<15%)',
            lowVol > 0 ? 'var(--signal-low)' : 'var(--text-muted)'),
        createSummaryCard('range', rangeCount + '/' + validEtfs.length, '📐 震荡市占比',
            rangeCount >= 4 ? 'var(--signal-low)' :
            rangeCount >= 2 ? 'var(--signal-mid)' : 'var(--signal-high)'),
    ];
    container.innerHTML = cards.join('');

    // 更新模型模式显示
    const modeEl = document.getElementById('headerModelMode');
    if (modeEl) {
        modeEl.textContent = '区间内机械式高抛低吸 — 震荡市首选';
        modeEl.style.color = 'var(--accent-blue)';
    }

    // 渲染网格卡片
    const grid = document.getElementById('dashboardGrid');
    grid.innerHTML = etfs.map(etf => createGridCard(etf)).join('');

    // 更新交叉验证
    const avgVol = etfs.reduce((s, e) => s + (e.annual_vol || 0), 0) / (etfs.length || 1);
    let verdict;
    if (avgVol >= 20) verdict = '📈 市场波动率偏高 — 网格收益潜力大';
    else if (avgVol >= 12) verdict = '📊 波动率适中 — 适合网格交易';
    else verdict = '📉 波动率偏低 — 网格收益空间有限';

    const infoEl = document.getElementById('refreshInfo');
    infoEl.textContent = `${verdict} | 平均波动率: ${avgVol.toFixed(1)}%`;

    const now = new Date();
    updateHeaderTime(
        now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        data.target_date || etfs[0]?.recent_signal?.date || '--'
    );

    // 隐藏历史Tab（网格无日信号概念）
    const histBtn = document.querySelector('[data-tab="history"]');
    if (histBtn) histBtn.style.display = 'none';
}

function createGridCard(etf) {
    if (etf.error) {
        return `<div class="etf-card card-error">
            <div class="card-header">
                <span class="card-code">${etf.code}</span>
                <span class="card-name">${etf.name}</span>
            </div>
            <div class="card-body">
                <p class="card-error-text">⚠️ ${etf.error}</p>
            </div>
        </div>`;
    }

    const g = etf.grid || {};
    const pos = etf.position_pct || 50;
    const posColor = pos <= 20 ? 'var(--signal-low)' : pos >= 80 ? 'var(--signal-high)' : 'var(--signal-mid)';
    const chgStr = etf.change_pct >= 0 ? '+' + etf.change_pct + '%' : etf.change_pct + '%';

    return `<div class="etf-card">
        <div class="card-header">
            <span class="card-code">${etf.code}</span>
            <span class="card-name">${etf.name}</span>
        </div>
        <div class="card-body">
            <div class="grid-price-row">
                <span class="grid-price">${etf.price.toFixed(3)}</span>
                <span class="grid-change" style="color:${etf.change_pct>=0?'var(--signal-low)':'var(--signal-high)'}">${chgStr}</span>
            </div>
            <div class="grid-range-bar">
                <div class="grid-range-label">${g.low?.toFixed(3) || '--'}</div>
                <div class="grid-range-track">
                    <div class="grid-range-fill" style="width:${pos}%;background:${posColor};"></div>
                </div>
                <div class="grid-range-label">${g.high?.toFixed(3) || '--'}</div>
            </div>
            <div class="grid-info-row">
                <span>📍 第${etf.current_level}/${g.layers}层</span>
                <span>📏 间距${g.spacing?.toFixed(3) || '--'}</span>
            </div>
            <div class="grid-info-row">
                <span>📊 波动率: ${etf.annual_vol}%</span>
                <span>📐 60日振幅: ${etf.range_pct_60d}%</span>
            </div>
            ${etf.recent_signal ? `
            <div class="grid-signal-row">
                <span>${etf.recent_signal.action === 'BUY' ? '📗' : '📕'} 最近信号: ${etf.recent_signal.date} ${etf.recent_signal.action} @${etf.recent_signal.price.toFixed(3)}</span>
            </div>
            ` : '<div class="grid-signal-row"><span>⚪ 近60日无信号</span></div>'}
        </div>
    </div>`;
}

function renderGridReport(data) {
    if (!data || !data.etfs) return;

    const etfs = data.etfs.filter(e => !e.error);
    if (etfs.length === 0) return;

    const sorted = [...etfs].sort((a, b) => (b.annual_vol || 0) - (a.annual_vol || 0));
    const avgVol = (sorted.reduce((s, e) => s + e.annual_vol, 0) / sorted.length).toFixed(1);
    const rangeCount = sorted.filter(e => e.is_range_bound).length;

    let rating;
    if (avgVol >= 20) rating = '🔴 高波动市场 — 网格交易收益潜力大，注意控制仓位';
    else if (avgVol >= 12) rating = '🟡 中等波动 — 适合网格交易，区间操作';
    else rating = '⚪ 低波动市场 — 网格收益空间有限，建议观望或收紧间距';

    const reportPanel = document.getElementById('panel-report');
    if (!reportPanel) return;

    reportPanel.innerHTML = `
        <div class="report-container">
            <h3>📊 网格策略综合报告</h3>
            <div class="report-rating">${rating}</div>
            <div class="report-summary">
                <span>平均波动率: ${avgVol}%</span>
                <span>震荡市占比: ${rangeCount}/${sorted.length}</span>
                <span>网格间距: 1.5% (默认)</span>
            </div>
            <h4>🏆 网格潜力排名</h4>
            <table class="report-table">
                <thead><tr><th>代码</th><th>名称</th><th>价格</th><th>波动率</th><th>区间</th><th>当前层</th></tr></thead>
                <tbody>
                    ${sorted.map(e => `<tr>
                        <td>${e.code}</td>
                        <td>${e.name}</td>
                        <td>${e.price?.toFixed(3)}</td>
                        <td>${e.annual_vol}%</td>
                        <td>${e.grid?.low?.toFixed(3) || '--'} ~ ${e.grid?.high?.toFixed(3) || '--'}</td>
                        <td>${e.current_level}/${e.grid?.layers || '--'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <p class="report-note">💡 波动率越高，网格交易收益潜力越大。间距和层数可在「模拟盘」中自定义。</p>
        </div>
    `;
}

