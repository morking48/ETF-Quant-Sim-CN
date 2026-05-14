/**
 * ETF三因子监测系统 — 主入口
 * Tab路由、数据刷新、初始化
 */

// ========== 全局状态 ==========
let appData = null;
let currentTab = 'dashboard';
let isRefreshing = false;

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🛡️ ETF三因子监测系统启动...');
    
    // 初始化Tab导航
    initTabNav();
    
    // 初始化历史Tab日期按钮
    initHistoryButtons();
    
    // 首先检查后端健康状态
    await checkBackend();
    
    // 自动执行首次分析
    await doRefresh();
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
        // 1. 获取ETF列表（用于初始化下拉框等）
        const etfList = await apiGetETFList();
        
        // 2. 初始化详情页下拉框
        initDetailSelect(etfList);
        
        // 3. 获取完整分析数据
        infoEl.textContent = '正在获取数据...';
        const analysis = await apiGetAnalysis();
        appData = analysis;
        
        // 4. 渲染仪表盘
        renderDashboard(analysis);
        
        // 5. 初始化历史视图数据（不立即渲染，切到Tab时才渲染）
        initHistory(analysis);
        
        // 6. 更新模拟盘（结算持仓 + 生成交易建议）
        updateSimulator(analysis);
        
        // 7. 更新最后刷新时间
        const now = new Date();
        infoEl.textContent = `分析日: ${analysis.target_date || '--'} | 刷新: ${now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
        updateHeaderTime(
            now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            analysis.target_date || '--'
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