/**
 * Tab1: 仪表盘视图
 * 渲染信号汇总 + 7只ETF卡片
 */

/**
 * 渲染仪表盘
 */
function renderDashboard(analysisData) {
    if (!analysisData || !analysisData.etfs) return;
    
    const { summary, etfs, mode, share_available } = analysisData;
    
    // 更新顶部汇总卡片
    renderSummaryCards(summary);
    
    // 更新模型模式显示
    const modeEl = document.getElementById('headerModelMode');
    if (modeEl) {
        if (mode === 'three_factor') {
            modeEl.textContent = '量能50% + 方向20% + 份额30%（✅ 三因子完整模式）';
            modeEl.style.color = 'var(--signal-low)';
        } else {
            modeEl.textContent = '量能70% + 方向30%（⚠️ 二因子模式，份额暂缺）';
            modeEl.style.color = 'var(--signal-mid)';
        }
    }
    
    // 渲染ETF卡片
    const grid = document.getElementById('dashboardGrid');
    grid.innerHTML = etfs.map(etf => createETFCard(etf)).join('');
    
    // 更新交叉验证判断
    const cv = checkCrossValidation(etfs);
    const infoEl = document.getElementById('refreshInfo');
    infoEl.textContent = `分析日: ${analysisData.target_date || '--'} | ${cv.verdict}`;
    
    // 更新顶部状态
    const now = new Date();
    updateHeaderTime(
        now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        analysisData.target_date || '--'
    );
}

/**
 * 渲染顶部汇总卡片
 */
function renderSummaryCards(summary) {
    if (!summary) return;
    
    const container = document.getElementById('summaryCards');
    const cards = [
        createSummaryCard('high', summary.high, '🔴 高确信', 
            summary.high > 0 ? 'var(--signal-high)' : 'var(--text-muted)'),
        createSummaryCard('mid', summary.mid, '🟡 中等关注', 
            summary.mid > 0 ? 'var(--signal-mid)' : 'var(--text-muted)'),
        createSummaryCard('normal', summary.normal, '⚪ 正常', 
            summary.normal > 0 ? 'var(--signal-low)' : 'var(--text-muted)'),
        createSummaryCard('hs300', summary.hs300_alert + '/4', '沪深300一致性',
            summary.hs300_alert >= 3 ? 'var(--signal-high)' : 
            summary.hs300_alert >= 2 ? 'var(--signal-mid)' : 'var(--signal-low)'),
    ];
    
    container.innerHTML = cards.join('');
}

/**
 * 仪表盘加载中状态
 */
function renderDashboardLoading() {
    const grid = document.getElementById('dashboardGrid');
    grid.innerHTML = Array.from({ length: 7 }, (_, i) => `
        <div class="etf-card signal-normal">
            <div class="card-header">
                <div><div class="card-code">--</div><div class="card-name">加载中...</div></div>
                <div class="card-signal">⏳</div>
            </div>
            <div class="card-prob">
                <div class="card-prob-value" style="color: var(--text-muted);">--</div>
                <div class="card-prob-label">获取数据中</div>
            </div>
        </div>
    `).join('');
}