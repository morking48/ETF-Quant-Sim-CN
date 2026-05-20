/**
 * ETF三因子监测系统 — 主入口
 * Tab路由、数据刷新、初始化
 */

// ========== 全局状态 ==========
let appData = null;
let currentTab = 'dashboard';
let isRefreshing = false;
let lastRefreshMinute = -1;
let _reportPanelBackup = null;

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', async () => {
    console.log('ETF 多策略量化系统 启动...');
    
    // 保存综合报告面板原始HTML（网格会覆盖）
    const panel = document.getElementById('panel-report');
    if (panel) _reportPanelBackup = panel.innerHTML;
    
    // 初始化策略选择器
    initStrategySelector();
    updateStrategyDescription();
    
    // 初始化Tab导航
    initTabNav();
    
    // 初始化历史Tab日期按钮
    initHistoryButtons();
    
    // 首先检查后端健康状态
    await checkBackend();
    
    // 自动执行首次分析
    await doRefresh();
    
    // 开启定时自动刷新
    initAutoRefresh();
});

// ========== Tab 路由 ==========
function initTabNav() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            switchTab(tab);
        });
    });
}

function switchTab(tab) {
    currentTab = tab;
    
    // 更新Tab按钮状态
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    // 更新面板显示
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`panel-${tab}`);
    if (panel) panel.classList.add('active');
    
    // 切换到详情时，如果还没加载过数据，加载第一只ETF
    if (tab === 'detail' && appData && appData.etfs && appData.etfs.length > 0) {
        const select = document.getElementById('detailSelect');
        if (select && !detailData) {
            loadDetail(select.value);
        }
        // 延迟resize图表
        setTimeout(() => {
            if (gaugeChartVp) gaugeChartVp.resize();
            if (gaugeChartDp) gaugeChartDp.resize();
            if (gaugeChartCp) gaugeChartCp.resize();
            if (trendChart) trendChart.resize();
        }, 200);
    }
    
    // 切换到历史时，确保已初始化
    if (tab === 'history' && appData && !historyDateList.length) {
        initHistory(appData);
    }
    // 延迟resize热力图
    if (tab === 'history') {
        setTimeout(() => {
            if (heatmapChart) heatmapChart.resize();
        }, 200);
    }
    
    // 切换到模拟盘时，初始化并渲染
    if (tab === 'simulator') {
        initSimulator();
        renderSimulator();
        setTimeout(() => {
            if (simEquityChart) simEquityChart.resize();
        }, 200);
    }
}

function initHistoryButtons() {
    const prevBtn = document.getElementById('btnPrevDate');
    const nextBtn = document.getElementById('btnNextDate');
    
    if (prevBtn) prevBtn.addEventListener('click', () => navigateHistory('prev'));
    if (nextBtn) nextBtn.addEventListener('click', () => navigateHistory('next'));
}

// ========== 健康检查 ==========
async function checkBackend() {
    try {
        setStatusDot('loading');
        await apiHealth();
        setStatusDot('ok');
        console.log('✅ 后端服务连接正常');
    } catch (err) {
        setStatusDot('error');
        showError(`无法连接后端服务: ${err.message}。请确保已启动 python backend/server.py`);
        console.error('❌ 后端连接失败:', err);
    }
}

// ========== 自动刷新 ==========
function initAutoRefresh() {
    setInterval(() => {
        const now = new Date();
        const day = now.getDay();
        
        // 过滤周末
        if (day === 0 || day === 6) return;

        const h = now.getHours();
        const m = now.getMinutes();

        // 指定刷新时间：09:30, 10:00, 10:30, 11:00, 11:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00
        const targetTimes = [
            [9, 30], [10, 0], [10, 30], [11, 0], [11, 30],
            [13, 0], [13, 30], [14, 0], [14, 30], [15, 0], [15, 30], [16, 0]
        ];

        const isTarget = targetTimes.some(t => t[0] === h && t[1] === m);

        if (isTarget && lastRefreshMinute !== m) {
            lastRefreshMinute = m;
            console.log(`[自动刷新] 触发时间: ${h}:${m.toString().padStart(2, '0')}`);
            doRefresh();
        }
    }, 10000); // 每10秒检测一次
}

// ========== 数据刷新 ==========
async function doRefresh() {
    if (isRefreshing) return;
    
    isRefreshing = true;
    const btn = document.getElementById('btnRefresh');
    const infoEl = document.getElementById('refreshInfo');
    
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> 刷新中...';
    setStatusDot('loading');
    showLoading();
    
    try {
        // 1. 获取ETF列表
        const etfList = await apiGetETFList();
        initDetailSelect(etfList);
        
        // 2. 按策略获取分析数据
        infoEl.textContent = '正在加载分析数据...';
        let analysis;
        if (activeStrategyId === 'grid') {
            analysis = await apiGetGridAnalysis(250);
            appData = analysis;
            // 网格策略专属渲染
            renderGridDashboard(analysis);
            renderGridReport(analysis);
        } else {
            analysis = await apiGetAnalysis();
            appData = analysis;
            // 三因子策略渲染
            const histBtn = document.querySelector('[data-tab="history"]');
            if (histBtn) histBtn.style.display = '';
            // 恢复综合报告面板原始HTML（网格可能已覆盖）
            const reportPanel = document.getElementById('panel-report');
            if (reportPanel && _reportPanelBackup) reportPanel.innerHTML = _reportPanelBackup;
            renderDashboard(analysis);
            initHistory(analysis);
            renderReport(analysis);
        }
        
        // 3. 更新模拟盘
        try {
            if (typeof updateSimulator === 'function') {
                updateSimulator(analysis);
            }
        } catch (simErr) {
            console.warn('模拟盘更新跳过:', simErr.message);
        }
        
        // 4. 数据健康检查
        validateDataFreshness(analysis);

        // 5. 更新跨策略信号看板
        await updateSignalDashboard();

        // 6. 更新刷新时间
        const now = new Date();
        const tdate = analysis.target_date || analysis.etfs?.[0]?.recent_signal?.date || '--';
        infoEl.textContent = `分析日: ${tdate} | 刷新: ${now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
        updateHeaderTime(
            now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            tdate
        );
        
        setStatusDot('ok');
        console.log('✅ 数据刷新完成');
        
    } catch (err) {
        console.error('❌ 数据刷新失败:', err);
        setStatusDot('error');
        showError(`数据刷新失败: ${err.message}`);
        infoEl.textContent = `刷新失败: ${err.message}`;
    } finally {
        isRefreshing = false;
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">🔄</span> 刷新数据';
        hideLoading();
    }
}

// ========== 数据可靠性校验 ==========
function validateDataFreshness(analysis) {
    if (!analysis || !analysis.etfs) return;
    
    // 网格策略只检查数据新鲜度，不检查三因子特有字段
    if (activeStrategyId === 'grid') {
        const targetDate = analysis.target_date;
        if (targetDate) {
            const today = new Date();
            const td = new Date(targetDate);
            const daysDiff = Math.round((today - td) / 86400000);
            if (daysDiff > 2) {
                console.warn('🔍 数据健康检查: ⚠️ 数据滞后' + daysDiff + '天 (最新: ' + targetDate + ')');
                setStatusDot('error');
            } else {
                console.log('✅ 数据健康检查通过 (网格策略)', { 目标日期: targetDate, ETF数量: analysis.etfs.filter(e => !e.error).length });
                setStatusDot('ok');
            }
        }
        return;
    }
    
    const targetDate = analysis.target_date;
    const etfs = analysis.etfs;
    const issues = [];
    
    // 1. 数据新鲜度检查（target_date 距今天 ≤ 2 个自然日）
    if (targetDate) {
        const today = new Date();
        const td = new Date(targetDate);
        const daysDiff = Math.round((today - td) / (1000 * 60 * 60 * 24));
        if (daysDiff > 2) {
            issues.push(`⚠️ 数据滞后${daysDiff}天 (最新: ${targetDate})`);
            setStatusDot('error');
        }
    }
    
    // 2. K线数据完整性校验
    let totalHistory = 0, emptyCount = 0;
    etfs.forEach(etf => {
        if (etf.history && etf.history.length > 20) {
            totalHistory++;
            // 检查是否有连续价格为0的异常
            const hasZeroPrice = etf.history.some(h => h.c <= 0);
            if (hasZeroPrice) {
                issues.push(`❌ ${etf.code}存在异常价格(≤0)`);
            }
        } else {
            emptyCount++;
        }
    });
    if (emptyCount > 0) {
        issues.push(`⚠️ ${emptyCount}只ETF数据不足(<20条)`);
    }
    
    // 3. 份额因子可用性（使用后端返回的 share_available 标志）
    const shareOK = analysis.share_available === true;
    if (!shareOK) {
        issues.push('ℹ️ 份额因子不可用(需akshare+盘后数据)');
    }
    
    // 4. 信号合理性校验（避免全是0或全是100）
    const cps = etfs.filter(e => e.latest).map(e => e.latest.cp);
    const allZero = cps.length > 0 && cps.every(cp => cp === 0);
    const allSame = cps.length > 1 && new Set(cps.map(c => Math.round(c))).size === 1;
    if (allZero) issues.push('🚨 所有ETF综合概率均为0，可能是mock数据');
    if (allSame) issues.push('⚠️ 所有ETF综合概率一致，数据可能未更新');
    
    // 5. 输出健康报告
    if (issues.length > 0) {
        console.warn('🔍 数据健康检查:', issues.join(' | '));
        // 只在有严重问题时弹窗提示
        if (issues.some(i => i.startsWith('🚨'))) {
            showError(issues.join('\n'));
        }
    } else {
        console.log('✅ 数据健康检查通过', {
            目标日期: targetDate,
            ETF数量: totalHistory,
            三因子模式: analysis.mode || 'two_factor',
            份额可用: shareOK
        });
    }
    
    // 6. 更新页脚状态
    const footer = document.querySelector('.footer span');
    if (footer) {
        const statusIcon = issues.some(i => i.startsWith('🚨')) ? '🔴' : 
                          issues.some(i => i.startsWith('⚠️')) ? '🟡' : '✅';
        footer.textContent = `ETF国家队资金监测 · 三因子模型 · 腾讯财经API · v1.0 · ${statusIcon} 校验${
            issues.length > 0 ? ' (' + issues.length + '项问题)' : '通过'
        }`;
    }
}

/**
 * 异步更新跨策略信号看板（后台请求，不阻塞UI）
 */
async function updateSignalDashboard() {
    try {
        const data = await apiGetStrategySignals();
        if (typeof renderSignalDashboard === 'function') {
            renderSignalDashboard(data);
        }
    } catch (err) {
        console.warn('信号看板更新跳过:', err.message);
        const container = document.getElementById('signalDashboard');
        if (container) container.style.display = 'none';
    }
}