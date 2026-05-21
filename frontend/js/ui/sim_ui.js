/**
 * Tab4: 模拟盘视图
 * 资产总览 + 收益曲线 + 持仓/交易建议 + 交易记录 + 策略配置
 */

let simEquityChart = null;

// ========== 策略配置面板 ==========
function showSimConfig() {
    const config = getSimConfig();
    const strategyId = activeStrategyId;

    // 网格策略专属配置段
    let gridSection = '';
    if (strategyId === 'grid') {
        gridSection = `
        <div class="config-section">
            <h4>🔲 网格参数</h4>
            <label>网格模式 
                <select id="cfg_gridRangeMode">
                    <option value="auto" ${config.gridRangeMode==='auto'?'selected':''}>自动区间(±10%)</option>
                    <option value="manual" ${config.gridRangeMode==='manual'?'selected':''}>手动区间</option>
                </select>
            </label>
            <label>网格区间(%) <input id="cfg_gridRangePct" type="number" value="${config.gridRangePct || 10}" min="5" max="30"></label>
            <label>网格间距(%) <input id="cfg_gridSpacingPct" type="number" value="${config.gridSpacingPct || 4.0}" min="0.5" max="10" step="0.1"></label>
            <label>底仓比例(%) <input id="cfg_basePositionPct" type="number" value="${config.basePositionPct || 50}" min="10" max="80"></label>
            <label>预留现金(%) <input id="cfg_reservePct" type="number" value="${config.reservePct || 10}" min="0" max="30"></label>
        </div>`;
    }

    const html = `
    <div class="config-overlay" id="configOverlay" onclick="if(event.target===this) hideSimConfig()">
    <div class="config-panel">
        <h3>⚙️ ${StrategyRegistry.get(strategyId).name} 配置</h3>
        
        <div class="config-section">
            <h4>💰 资金设置</h4>
            <label>初始资金(元) <input id="cfg_capital" type="number" value="${config.initialCapital}" step="10000" min="5000"></label>
        </div>
        ${gridSection}
        ${strategyId === 'three_factor' ? `
        <div class="config-section">
            <h4>📊 仓位控制</h4>
            <label>首次建仓比例(%) <input id="cfg_positionRatio" type="number" value="${Math.round(config.positionRatio * 100)}" min="10" max="80"></label>
            <label>加仓比例(%) <input id="cfg_addRatio" type="number" value="${Math.round(config.addRatio * 100)}" min="5" max="50"></label>
            <label>单只ETF上限(%) <input id="cfg_maxSinglePct" type="number" value="${Math.round(config.maxSinglePct * 100)}" min="20" max="100"></label>
            <label>总仓位上限(%) <input id="cfg_maxTotalPct" type="number" value="${Math.round(config.maxTotalPct * 100)}" min="30" max="100"></label>
        </div>
        <div class="config-section">
            <h4>🛑 止损设置</h4>
            <label>硬止损(%) <input id="cfg_stopLossPct" type="number" value="${Math.round(config.stopLossPct * -100)}" min="2" max="20"> (负数)</label>
            <label>时间止损(天) <input id="cfg_timeStopDays" type="number" value="${config.timeStopDays}" min="3" max="30"></label>
            <label>信号卖出阈值(%) <input id="cfg_signalSellPct" type="number" value="${Math.round(config.signalSellPct * 100)}" min="10" max="60"></label>
        </div>
        ` : ''}
        <div class="config-section">
            <h4>🎯 交易模式</h4>
            <label><input type="radio" name="cfg_tradeMode" value="manual" ${config.tradeMode==='manual'?'checked':''}> 手动确认（推荐）</label>
            <label><input type="radio" name="cfg_tradeMode" value="semi" ${config.tradeMode==='semi'?'checked':''}> 半自动</label>
            <label><input type="radio" name="cfg_tradeMode" value="auto" ${config.tradeMode==='auto'?'checked':''}> 全自动</label>
        </div>
        <div class="config-section">
            <h4>💸 手续费率</h4>
            <label>手续费(万分之) <input id="cfg_feeRate" type="number" value="${Math.round(config.feeRate * 10000)}" min="1" max="10"></label>
        </div>
        
        <div class="config-actions">
            <button class="btn-sim btn-save" onclick="saveSimConfigFromUI()">💾 保存配置</button>
            <button class="btn-sim btn-reset" onclick="resetConfigFromUI()">↩ 恢复默认</button>
            <button class="btn-sim btn-cancel" onclick="hideSimConfig()">✖ 取消</button>
        </div>
    </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', html);
}

function hideSimConfig() {
    const el = document.getElementById('configOverlay');
    if (el) el.remove();
}

function saveSimConfigFromUI() {
    const baseConfig = {
        initialCapital: +document.getElementById('cfg_capital').value,
        feeRate: (+document.getElementById('cfg_feeRate').value) / 10000,
    };

    // 网格策略：只保存网格参数
    if (activeStrategyId === 'grid') {
        const gridEl_gridRangePct = document.getElementById('cfg_gridRangePct');
        const gridEl_gridSpacingPct = document.getElementById('cfg_gridSpacingPct');
        const gridEl_basePositionPct = document.getElementById('cfg_basePositionPct');
        const gridEl_reservePct = document.getElementById('cfg_reservePct');
        const gridEl_gridRangeMode = document.getElementById('cfg_gridRangeMode');
        const tradeModeEl = document.querySelector('input[name="cfg_tradeMode"]:checked');
        const config = {
            ...baseConfig,
            gridRangeMode: gridEl_gridRangeMode ? gridEl_gridRangeMode.value : 'auto',
            gridRangePct: gridEl_gridRangePct ? +gridEl_gridRangePct.value : 10,
            gridSpacingPct: gridEl_gridSpacingPct ? +gridEl_gridSpacingPct.value : 4.0,
            basePositionPct: gridEl_basePositionPct ? +gridEl_basePositionPct.value : 50,
            reservePct: gridEl_reservePct ? +gridEl_reservePct.value : 10,
            tradeMode: tradeModeEl ? tradeModeEl.value : 'manual',
        };
        saveSimConfig({...getSimConfig(), ...config});
        hideSimConfig();
        renderSimulator();
        return;
    }

    // 三因子策略
    const tradeModeEl = document.querySelector('input[name="cfg_tradeMode"]:checked');
    const config = {
        ...baseConfig,
        positionRatio: (+document.getElementById('cfg_positionRatio').value) / 100,
        addRatio: (+document.getElementById('cfg_addRatio').value) / 100,
        maxSinglePct: (+document.getElementById('cfg_maxSinglePct').value) / 100,
        maxTotalPct: (+document.getElementById('cfg_maxTotalPct').value) / 100,
        stopLossPct: -(+(document.getElementById('cfg_stopLossPct').value)) / 100,
        timeStopDays: +document.getElementById('cfg_timeStopDays').value,
        signalSellPct: (+document.getElementById('cfg_signalSellPct').value) / 100,
        tradeMode: tradeModeEl ? tradeModeEl.value : 'manual',
    };
    saveSimConfig({...getSimConfig(), ...config});
    hideSimConfig();
    renderSimulator();
}

function resetConfigFromUI() {
    resetSimConfig();
    const config = getSimConfig();
    document.getElementById('cfg_capital').value = config.initialCapital;
    if (activeStrategyId === 'grid') {
        const el_gridRangePct = document.getElementById('cfg_gridRangePct');
        const el_gridSpacingPct = document.getElementById('cfg_gridSpacingPct');
        const el_basePositionPct = document.getElementById('cfg_basePositionPct');
        const el_reservePct = document.getElementById('cfg_reservePct');
        if (el_gridRangePct) el_gridRangePct.value = config.gridRangePct || 10;
        if (el_gridSpacingPct) el_gridSpacingPct.value = config.gridSpacingPct || 4.0;
        if (el_basePositionPct) el_basePositionPct.value = config.basePositionPct || 50;
        if (el_reservePct) el_reservePct.value = config.reservePct || 10;
    } else {
        document.getElementById('cfg_positionRatio').value = Math.round(config.positionRatio * 100);
        document.getElementById('cfg_addRatio').value = Math.round(config.addRatio * 100);
        document.getElementById('cfg_maxSinglePct').value = Math.round(config.maxSinglePct * 100);
        document.getElementById('cfg_maxTotalPct').value = Math.round(config.maxTotalPct * 100);
        document.getElementById('cfg_stopLossPct').value = Math.round(config.stopLossPct * -100);
        document.getElementById('cfg_timeStopDays').value = config.timeStopDays;
        document.getElementById('cfg_signalSellPct').value = Math.round(config.signalSellPct * 100);
    }
    const tradeModeEl = document.querySelector('input[name="cfg_tradeMode"][value="manual"]');
    if (tradeModeEl) tradeModeEl.checked = true;
    document.getElementById('cfg_feeRate').value = Math.round(config.feeRate * 10000);
}

// ========== 主视图渲染 ==========
function renderSimulator() {
    const config = getSimConfig();
    const trades = getSimTrades();
    const snapshots = getSimSnapshots();
    const positions = getSimPositions();
    const lastSnapshot = snapshots[snapshots.length - 1];
    
    const cash = lastSnapshot ? lastSnapshot.cash : config.initialCapital;
    const marketValue = positions.reduce((s, p) => s + (p.marketValue || 0), 0);
    const totalValue = cash + marketValue;
    const totalReturn = calcTotalReturn(totalValue, config.initialCapital);
    const winRate = calcWinRate(trades);
    const maxDD = calcMaxDrawdown(snapshots);
    const sharpe = calcSharpe(snapshots);
    
    // 渲染资产卡片
    renderSimOverview(totalValue, cash, marketValue, totalReturn, winRate, maxDD, sharpe, trades.length);
    // 渲染收益曲线
    renderSimEquityChart(snapshots);
    // 渲染持仓
    renderSimPositions(positions, cash);
    // 渲染交易建议
    renderSimSuggestions();
    // 渲染交易记录
    renderSimTrades(trades);
    // 更新统计面板
    renderSimStats(totalValue, totalReturn, winRate, maxDD, sharpe);
}

function renderSimOverview(totalValue, cash, mv, totalReturn, winRate, maxDD, sharpe, tradeCount) {
    const container = document.getElementById('simOverview');
    if (!container) return;
    const retColor = totalReturn >= 0 ? 'var(--signal-low)' : 'var(--signal-high)';
    const retSign = totalReturn >= 0 ? '+' : '';
    container.innerHTML = `
        <div class="sim-overview-card sim-ov-main">
            <div class="sim-ov-value" style="color:${retColor}">¥${formatNumber(totalValue, 2)}</div>
            <div class="sim-ov-label">总资产 <span style="color:${retColor}">${retSign}${totalReturn}%</span></div>
        </div>
        <div class="sim-overview-card">
            <div class="sim-ov-value">¥${formatNumber(cash, 2)}</div>
            <div class="sim-ov-label">现金余额</div>
        </div>
        <div class="sim-overview-card">
            <div class="sim-ov-value">¥${formatNumber(mv, 2)}</div>
            <div class="sim-ov-label">持仓市值</div>
        </div>
        <div class="sim-overview-card">
            <div class="sim-ov-value">${tradeCount}次</div>
            <div class="sim-ov-label">累计交易</div>
        </div>
        <div class="sim-overview-card">
            <div class="sim-ov-value" style="color:${winRate.winRate >= 50 ? 'var(--signal-low)' : 'var(--signal-mid)'}">${winRate.winRate}%</div>
            <div class="sim-ov-label">胜率 ${winRate.winCount}/${winRate.totalCount}</div>
        </div>
        <div class="sim-overview-card">
            <div class="sim-ov-value" style="color:var(--signal-high)">-${maxDD.maxDrawdownPct}%</div>
            <div class="sim-ov-label">最大回撤</div>
        </div>`;
}

function renderSimEquityChart(snapshots) {
    if (typeof echarts === 'undefined') return;
    const dom = document.getElementById('chartSimEquity');
    if (!dom) return;
    if (!simEquityChart) {
        simEquityChart = echarts.init(dom);
        window.addEventListener('resize', () => simEquityChart && simEquityChart.resize());
    }
    if (!snapshots || snapshots.length < 2) {
        simEquityChart.setOption({ title: { text: '等待交易数据...', left: 'center', top: 'center', textStyle: { color: '#64748b' } } });
        return;
    }
    const dates = snapshots.map(s => s.date);
    const totalValues = snapshots.map(s => s.totalValue);
    const config = getSimConfig();
    const benchmarkValues = snapshots.map(s => config.initialCapital * (1 + (s.benchmarkPct || 0) / 100));
    simEquityChart.setOption({
        backgroundColor: 'transparent',
        title: { text: '收益曲线（模拟权益 vs 基准）', left: 'center', top: 8, textStyle: { color: '#8899aa', fontSize: 13, fontWeight: 600 } },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(20,27,38,0.95)', borderColor: 'rgba(56,189,248,0.2)', textStyle: { color: '#e0e6f0', fontSize: 12 } },
        legend: { data: ['模拟权益', '沪深300基准(简)'], bottom: 0, textStyle: { color: '#8899aa', fontSize: 11 } },
        grid: { top: 40, right: 30, bottom: 30, left: 70 },
        xAxis: { type: 'category', data: dates, axisLabel: { color: '#64748b', fontSize: 10, rotate: 45 } },
        yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 10, formatter: '¥{value}' }, splitLine: { lineStyle: { color: 'rgba(56,189,248,0.06)' } } },
        series: [
            { name: '模拟权益', type: 'line', data: totalValues, smooth: true, lineStyle: { color: '#38bdf8', width: 2.5 }, itemStyle: { color: '#38bdf8' }, symbol: 'circle', symbolSize: 4, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(56,189,248,0.2)' }, { offset: 1, color: 'rgba(56,189,248,0)' }] } } },
            { name: '沪深300基准(简)', type: 'line', data: benchmarkValues, smooth: true, lineStyle: { color: '#64748b', width: 1.5, type: 'dashed' }, itemStyle: { color: '#64748b' }, symbol: 'none' }
        ]
    }, true);
}

function renderSimPositions(positions, cash) {
    const container = document.getElementById('simPositions');
    if (!container) return;
    if (positions.length === 0) {
        container.innerHTML = '<div class="sim-empty">暂无持仓</div><div class="sim-cash">💵 可用现金：¥' + formatNumber(cash, 2) + '</div>';
        return;
    }
    container.innerHTML = positions.map(p => {
        const pnlColor = (p.pnl || 0) >= 0 ? 'var(--signal-low)' : 'var(--signal-high)';
        const pnlSign = (p.pnl || 0) >= 0 ? '+' : '';
        const sellId = 'sellQty_' + p.code;
        return '<div class="sim-position-item">' +
            '<div class="sim-pos-header"><span class="sim-pos-code">' + p.code + '</span><span class="sim-pos-name">' + p.name + '</span></div>' +
            '<div class="sim-pos-detail"><div>成本 ¥' + (p.costPrice || 0).toFixed(3) + ' → 现价 ¥' + (p.currentPrice || 0).toFixed(3) + '</div>' +
            '<div>持有 ' + (p.shares || 0) + '份 | 市值 ¥' + formatNumber(p.marketValue || 0, 2) + '</div>' +
            '<div style="color:' + pnlColor + ';font-weight:700">' + pnlSign + '¥' + formatNumber(p.pnl || 0, 2) + ' (' + pnlSign + (p.pnlPct || 0).toFixed(1) + '%)</div></div>' +
            '<div class="sim-pos-footer"><span>持有' + (p.holdDays || 0) + '天</span>' +
            '<input type="number" id="' + sellId + '" value="' + (p.shares || 0) + '" min="100" step="100" max="' + (p.shares || 0) + '" style="width:70px;padding:2px 4px;font-size:10px;margin:0 4px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:3px;" title="卖出份数(100的倍数)">' +
            '<button class="btn-sim btn-reset" style="padding:2px 8px;font-size:10px;" onclick="execSellPosition(\'' + p.code + '\',\'' + p.name + '\',\'' + sellId + '\')">🔴 卖出</button></div></div>';
    }).join('') + '<div class="sim-cash">💵 可用现金：¥' + formatNumber(cash, 2) + '</div>';
}

function renderSimSuggestions() {
    const container = document.getElementById('simSuggestions');
    if (!container) return;
    const config = getSimConfig();

    // 兼容新旧格式
    const raw = window._lastSimSuggestions;
    const suggestions = raw ? (Array.isArray(raw) ? raw : raw.suggestions) : [];
    const stats = (raw && !Array.isArray(raw)) ? raw.stats : null;

    // 统计条（始终显示）
    let statsHtml = '';
    if (stats && stats.type === 'three_factor') {
        const modeLabel = config.tradeMode === 'auto' ? '🤖全自动' : (config.tradeMode === 'semi' ? '⚡半自动' : '✋手动');
        statsHtml = `<div class="sim-stats-bar" style="display:flex;gap:16px;flex-wrap:wrap;padding:8px 12px;background:var(--bg-secondary);border-radius:6px;margin-bottom:8px;font-size:12px;color:var(--text-secondary);">
            <span>📅 ${stats.date || '--'}</span> <span>🔴高确信 ${stats.high}</span> <span>🟡中等 ${stats.mid}</span>
            <span>⚪低信号 ${stats.low}</span> <span>📦持仓 ${stats.held}只</span> <span>📊仓位 ${stats.usedPct || 0}%</span>
            <span style="margin-left:auto;color:var(--accent-blue);">${modeLabel}模式</span></div>`;
    } else if (stats && stats.type === 'grid') {
        const modeLabel = config.tradeMode === 'auto' ? '🤖全自动' : (config.tradeMode === 'semi' ? '⚡半自动' : '✋手动');
        statsHtml = `<div class="sim-stats-bar" style="display:flex;gap:16px;flex-wrap:wrap;padding:8px 12px;background:var(--bg-secondary);border-radius:6px;margin-bottom:8px;font-size:12px;color:var(--text-secondary);">
            <span>📅 ${stats.date || '--'}</span> <span>📈区间顶 ${stats.top}</span> <span>📉区间底 ${stats.bottom}</span>
            <span>📏中枢 ${stats.mid}</span> <span>📦持仓 ${stats.held}只</span> <span>📊均波 ${stats.avgVol}%</span>
            <span style="margin-left:auto;color:var(--accent-blue);">${modeLabel}模式</span></div>`;
    }

    if (suggestions.length === 0) {
        const emptyMsg = stats && stats.type === 'three_factor'
            ? '📊 ' + (stats.high > 0 ? `${stats.high}只高确信(${Array.from({length:stats.high}, (_,i)=>'🔴').join('')}) 但均未触发买入条件` : `全部${stats.total}只ETF cp<70%，无高确信信号触发`) 
            : (stats && stats.type === 'grid'
                ? '📏 全部' + stats.total + '只ETF处于区间中枢(20%~80%)，无极端位置触发'
                : '暂无交易建议（刷新数据后生成）');
        container.innerHTML = statsHtml + '<div class="sim-empty" style="color:var(--text-muted);font-size:13px;">' + emptyMsg + '</div>';
        return;
    }
    
    container.innerHTML = statsHtml + suggestions.map(s => {
        const isBuy = s.action === 'BUY';
        const actionColor = isBuy ? 'var(--signal-low)' : 'var(--signal-high)';
        const actionLabel = isBuy ? '买入' : '卖出';
        return '<div class="sim-suggestion-item" style="border-left: 4px solid ' + actionColor + '">' +
            '<div class="sim-sug-header"><span style="color:' + actionColor + ';font-weight:700">' + (isBuy ? '🟢' : '🔴') + ' ' + actionLabel + '</span>' +
            '<span>' + s.code + ' ' + (s.name || '') + '</span>' +
            (s.urgent ? '<span style="color:var(--signal-high);font-size:11px">‼紧急</span>' : '') + '</div>' +
            '<div class="sim-sug-reason" style="font-size:11px;line-height:1.5;">' + s.reason + '</div>' +
            (config.tradeMode !== 'manual' ? '' : '<button class="btn-sim btn-exec" onclick="showTradeConfirm(\'' + s.action + '\',\'' + s.code + '\',\'' + s.name + '\',\'' + s.reason.replace(/'/g, "\\'") + '\')">✅ 确认执行</button>') +
            '</div>';
    }).join('');
}

function renderSimTrades(trades) {
    const container = document.getElementById('simTrades');
    if (!container) return;
    if (trades.length === 0) { container.innerHTML = '<div class="sim-empty">暂无交易记录</div>'; return; }
    const recent = trades.slice(-10).reverse();
    container.innerHTML = recent.map(t => {
        const isBuy = t.action === 'BUY';
        const actionColor = isBuy ? 'var(--signal-low)' : 'var(--signal-high)';
        const actionLabel = isBuy ? '买入' : '卖出';
        const pnlStr = t.pnl != null ? '<span style="color:' + (t.pnl >= 0 ? 'var(--signal-low)' : 'var(--signal-high)') + '">' + (t.pnl >= 0 ? '+' : '') + '¥' + formatNumber(t.pnl, 2) + '</span>' : '';
        return '<div class="sim-trade-item"><div class="sim-trade-header"><span>' + t.date + '</span>' +
            '<span style="color:' + actionColor + ';font-weight:700">' + actionLabel + '</span><span>' + t.code + '</span></div>' +
            '<div class="sim-trade-detail"><span>' + t.shares + '份 @ ¥' + t.price.toFixed(3) + '</span><span>¥' + formatNumber(t.amount, 2) + '</span>' + pnlStr + '</div>' +
            '<div class="sim-trade-signal">信号: ' + (t.signal || '-') + '</div></div>';
    }).join('');
}

function renderSimStats(totalValue, totalReturn, winRate, maxDD, sharpe) {
    const container = document.getElementById('simStats');
    if (!container) return;
    container.innerHTML =
        '<div class="sim-stat-item"><span>累计收益</span><span style="color:' + (totalReturn >= 0 ? 'var(--signal-low)' : 'var(--signal-high)') + '">' + (totalReturn >= 0 ? '+' : '') + totalReturn + '%</span></div>' +
        '<div class="sim-stat-item"><span>胜率</span><span>' + winRate.winRate + '%</span></div>' +
        '<div class="sim-stat-item"><span>最大回撤</span><span style="color:var(--signal-high)">' + maxDD.maxDrawdownPct + '%</span></div>' +
        '<div class="sim-stat-item"><span>夏普比</span><span>' + sharpe + '</span></div>' +
        '<div class="sim-stat-item"><span>已平仓</span><span>' + winRate.winCount + '盈/' + winRate.totalCount + '总</span></div>';
}

// ========== 交易执行 ==========
function execSuggestion(action, code, name, reason) {
    if (!appData || !appData.etfs) return;
    const etfData = appData.etfs.find(e => e.code === code);
    if (!etfData) return;
    // 网格策略用 etf.price，三因子用 etf.latest.c
    const price = etfData.price || (etfData.latest ? etfData.latest.c : null);
    if (!price) return;
    const date = appData.target_date || new Date().toISOString().slice(0, 10);
    const result = executeTrade({ action, code, name, reason }, price, date);
    if (result) {
        // 从待建议列表中移除已执行的建议
        if (window._lastSimSuggestions) {
            const raw = window._lastSimSuggestions;
            if (Array.isArray(raw)) {
                window._lastSimSuggestions = raw.filter(s => !(s.code === code && s.action === action));
            } else if (raw.suggestions) {
                raw.suggestions = raw.suggestions.filter(s => !(s.code === code && s.action === action));
            }
        }
        renderSimulator();
    } else {
        alert('交易执行失败：资金不足或数据异常');
    }
}

// ========== 交易确认弹窗 ==========
function showTradeConfirm(action, code, name, reason) {
    const existing = document.getElementById('tradeConfirmOverlay');
    if (existing) existing.remove();

    const config = getSimConfig();
    const snapshots = getSimSnapshots();
    const positions = getSimPositions();
    const lastSnapshot = snapshots.length ? snapshots[snapshots.length - 1] : null;
    const cash = lastSnapshot ? lastSnapshot.cash : config.initialCapital;

    if (!appData || !appData.etfs) return;
    const etfData = appData.etfs.find(e => e.code === code);
    if (!etfData) return;
    const price = etfData.price || (etfData.latest ? etfData.latest.c : null);
    if (!price) return;

    const isBuy = action === 'BUY';
    const actionEmoji = isBuy ? '🟢' : '🔴';
    const actionLabel = isBuy ? '买入' : '卖出';

    let defaultQty = 0, maxQty = 0;
    if (isBuy) {
        const suggestedAmt = Math.round(cash * (config.positionRatio || 0.3));
        const fee = Math.max(5, suggestedAmt * config.feeRate);
        defaultQty = Math.floor((suggestedAmt - fee) / price / 100) * 100;
        maxQty = Math.floor((cash * 0.99) / price / 100) * 100;
    } else {
        const pos = positions.find(p => p.code === code);
        if (pos) { defaultQty = pos.shares || 0; maxQty = pos.shares || 0; }
    }
    if (defaultQty < 100) defaultQty = 100;
    if (maxQty < 100) maxQty = 100;

    function buildDetail(qty) {
        if (isBuy) {
            const amt = qty * price;
            const fee = Math.max(5, amt * config.feeRate);
            const total = amt + fee;
            return '预期 ' + qty + '份 | 金额 ¥' + formatNumber(amt, 2) + ' | 手续费 ¥' + fee.toFixed(2) + ' | 合计 ¥' + formatNumber(total, 2) + (total > cash ? ' <span style="color:var(--signal-high);">⚠️超可用资金</span>' : '');
        } else {
            const income = qty * price;
            const fee = Math.max(5, income * config.feeRate);
            const net = income - fee;
            const pos = positions.find(p => p.code === code);
            const remaining = pos ? pos.shares - qty : 0;
            return '预期收入 ¥' + formatNumber(net, 2) + ' | 手续费 ¥' + fee.toFixed(2) + ' | 卖出后剩余 ' + remaining + '份' + (remaining > 0 && remaining < 100 ? ' <span style="color:var(--signal-high);">⚠️剩余不足1手将全部卖出</span>' : '');
        }
    }

    const html = '<div class="config-overlay" id="tradeConfirmOverlay" onclick="if(event.target===this) hideTradeConfirm()">' +
        '<div class="config-panel" style="max-width:440px;"><h3>' + actionEmoji + ' ' + actionLabel + ' ' + code + ' ' + (name || '') + '</h3>' +
        '<div style="margin:12px 0;font-size:13px;color:var(--text-primary);">' +
        '<div style="margin-bottom:8px;">现价: <strong>¥' + price.toFixed(3) + '</strong> | 可用现金: ¥' + formatNumber(cash, 2) + '</div>' +
        '<div style="color:var(--text-muted);font-size:11px;margin-bottom:10px;">' + reason + '</div>' +
        '<label style="display:block;font-weight:600;margin-bottom:4px;">' + (isBuy ? '买入金额(元)' : '卖出份数(100的倍数)') + '</label>' +
        (isBuy
            ? '<input type="number" id="tradeAmt" value="' + Math.round(cash * (config.positionRatio || 0.3)) + '" min="1000" step="100" style="width:100%;padding:10px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;font-size:16px;" oninput="updateTradeDetail()" onkeydown="if(event.key===\'Enter\')execConfirmedTrade(\'' + action + '\',\'' + code + '\',\'' + (name||'') + '\',\'' + reason.replace(/'/g, "\\'") + '\')">'
            : '<input type="number" id="tradeQty" value="' + defaultQty + '" min="100" step="100" max="' + maxQty + '" style="width:100%;padding:10px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;font-size:16px;" oninput="updateTradeDetail()" onkeydown="if(event.key===\'Enter\')execConfirmedTrade(\'' + action + '\',\'' + code + '\',\'' + (name||'') + '\',\'' + reason.replace(/'/g, "\\'") + '\')">') +
        '<div id="tradeDetail" style="margin-top:8px;font-size:12px;color:var(--text-secondary);">' + buildDetail(defaultQty) + '</div>' +
        '<div style="display:flex;gap:10px;margin-top:16px;">' +
        '<button class="btn-sim btn-save" style="flex:1;font-size:14px;padding:10px;" id="btnTradeConfirm">✅ 确认' + actionLabel + '</button>' +
        '<button class="btn-sim btn-cancel" style="flex:1;font-size:14px;padding:10px;" onclick="hideTradeConfirm()">✖ 取消</button>' +
        '</div></div></div></div>';

    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('btnTradeConfirm').onclick = function() { execConfirmedTrade(action, code, name, reason); };
    setTimeout(function() {
        var inp = document.getElementById(isBuy ? 'tradeAmt' : 'tradeQty');
        if (inp) { inp.focus(); inp.select(); }
    }, 50);

    // 实时计算辅助
    window._tradeDetailIsBuy = isBuy;
    window._tradeDetailPrice = price;
    window._tradeDetailCode = code;
    window._tradeDetailCash = cash;
    window._tradeDetailMaxQty = maxQty;
    window._tradeDetailDefaultQty = defaultQty;
    window.updateTradeDetail = function() {
        var detail = document.getElementById('tradeDetail');
        if (!detail) return;
        var qty;
        if (window._tradeDetailIsBuy) {
            var amtInp = document.getElementById('tradeAmt');
            var amt = amtInp ? parseInt(amtInp.value) || 0 : 0;
            var fee = Math.max(5, amt * (getSimConfig().feeRate || 0.00025));
            qty = Math.floor((amt - fee) / window._tradeDetailPrice / 100) * 100;
            var total = amt;
            detail.innerHTML = '预期 ' + qty + '份 | 金额 ¥' + formatNumber(amt, 2) + ' | 手续费 ¥' + fee.toFixed(2) + (total > window._tradeDetailCash ? ' <span style="color:var(--signal-high);">⚠️超可用资金</span>' : '');
        } else {
            var qtyInp = document.getElementById('tradeQty');
            qty = qtyInp ? parseInt(qtyInp.value) || 0 : 0;
            var income = qty * window._tradeDetailPrice;
            var fee2 = Math.max(5, income * (getSimConfig().feeRate || 0.00025));
            var net = income - fee2;
            var pos = getSimPositions().find(function(p) { return p.code === window._tradeDetailCode; });
            var remaining = pos ? pos.shares - qty : 0;
            detail.innerHTML = '预期收入 ¥' + formatNumber(net, 2) + ' | 手续费 ¥' + fee2.toFixed(2) + ' | 卖出后剩余 ' + remaining + '份' + (remaining > 0 && remaining < 100 ? ' <span style="color:var(--signal-high);">⚠️剩余不足1手将全部卖出</span>' : '');
        }
    };
}

function hideTradeConfirm() {
    var el = document.getElementById('tradeConfirmOverlay');
    if (el) el.remove();
    delete window._tradeDetailIsBuy;
    delete window._tradeDetailPrice;
    delete window._tradeDetailCode;
    delete window._tradeDetailCash;
    delete window._tradeDetailMaxQty;
    delete window._tradeDetailDefaultQty;
    delete window.updateTradeDetail;
}

function execConfirmedTrade(action, code, name, reason) {
    if (!appData || !appData.etfs) return;
    var etfData = appData.etfs.find(function(e) { return e.code === code; });
    if (!etfData) return;
    var price = etfData.price || (etfData.latest ? etfData.latest.c : null);
    if (!price) return;
    var date = appData.target_date || new Date().toISOString().slice(0, 10);
    var config = getSimConfig();

    var isBuy = action === 'BUY';
    var qty = 0;

    if (isBuy) {
        var amtInp = document.getElementById('tradeAmt');
        var amt = amtInp ? parseInt(amtInp.value) || 0 : 0;
        if (amt < 1000) { alert('最少买入1000元'); return; }
        var fee = Math.max(5, amt * config.feeRate);
        var total = amt + fee;
        var snapshots = getSimSnapshots();
        var lastSnapshot = snapshots.length ? snapshots[snapshots.length - 1] : null;
        var cash = lastSnapshot ? lastSnapshot.cash : config.initialCapital;
        if (total > cash) { alert('资金不足！需要 ¥' + formatNumber(total, 2) + '，可用 ¥' + formatNumber(cash, 2)); return; }
        qty = Math.floor((amt - fee) / price / 100) * 100;
        if (qty < 100) { alert('金额不足以买入1手(100份)'); return; }
    } else {
        var qtyInp = document.getElementById('tradeQty');
        qty = qtyInp ? parseInt(qtyInp.value) || 0 : 0;
        if (qty < 100) { alert('最少卖出100份(1手)'); return; }
    }

    var result;
    if (isBuy) {
        result = executeTrade({ action: 'BUY', code: code, name: name, reason: reason }, price, date);
    } else {
        result = executePartialSell(code, name, price, date, qty, reason);
    }

    hideTradeConfirm();

    if (result) {
        if (window._lastSimSuggestions) {
            var raw = window._lastSimSuggestions;
            if (Array.isArray(raw)) {
                window._lastSimSuggestions = raw.filter(function(s) { return !(s.code === code && s.action === action); });
            } else if (raw.suggestions) {
                raw.suggestions = raw.suggestions.filter(function(s) { return !(s.code === code && s.action === action); });
            }
        }
        renderSimulator();
    } else {
        alert('交易执行失败：资金不足或数据异常');
    }
}

// ========== 导出功能 ==========
function exportSimCSV() {
    const trades = getSimTrades();
    if (trades.length === 0) { alert('无交易记录可导出'); return; }
    const header = '日期,代码,名称,操作,价格,份数,金额,手续费,盈亏,信号原因\n';
    const rows = trades.map(t => t.date + ',' + t.code + ',' + t.name + ',' + t.action + ',' + t.price + ',' + t.shares + ',' + t.amount + ',' + t.fee + ',' + (t.pnl || '') + ',"' + (t.signal || '') + '"').join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ETF模拟交易记录_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
    URL.revokeObjectURL(url);
}

function exportSimJSON() {
    const config = getSimConfig();
    const trades = getSimTrades();
    const snapshots = getSimSnapshots();
    const positions = getSimPositions();
    const winRate = calcWinRate(trades);
    const maxDD = calcMaxDrawdown(snapshots);
    const lastSnap = snapshots[snapshots.length - 1];
    const totalValue = lastSnap ? lastSnap.totalValue : config.initialCapital;
    const summary = {
        exportTime: new Date().toISOString(), config: config,
        stats: { initialCapital: config.initialCapital, finalValue: totalValue, totalReturnPct: calcTotalReturn(totalValue, config.initialCapital), maxDrawdownPct: maxDD.maxDrawdownPct, sharpeRatio: calcSharpe(snapshots), winRate: winRate.winRate, totalTrades: trades.length, winCount: winRate.winCount },
        positions, trades, snapshots
    };
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ETF模拟统计_' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    URL.revokeObjectURL(url);
}

function resetSimAndUI() {
    if (confirm('确定重置模拟盘吗？所有持仓和交易记录将被清空。')) {
        resetSimulation(); initSimulator(); renderSimulator();
    }
}

// ========== 手动买入弹窗（多ETF批量） ==========
function showManualBuy() {
    if (!appData || !appData.etfs) { alert('请先刷新数据'); return; }
    const positions = getSimPositions();
    const lastSnapshot = getSimSnapshots().slice(-1)[0];
    const config = getSimConfig();
    const cash = lastSnapshot ? lastSnapshot.cash : config.initialCapital;
    const isGrid = activeStrategyId === 'grid';
    const rows = appData.etfs.map(e => {
        const latest = e.latest;
        const cp = isGrid ? (e.position_pct ? e.position_pct.toFixed(0) : '--') : (latest ? latest.cp.toFixed(0) : '--');
        const price = isGrid ? (e.price || 0).toFixed(3) : (latest ? latest.c.toFixed(3) : '--');
        const held = positions.find(p => p.code === e.code);
        const disabled = held ? 'disabled' : '';
        const heldLabel = held ? ' [已持有]' : '';
        const cpColor = cp >= 70 ? 'var(--signal-high)' : (cp >= 50 ? 'var(--signal-mid)' : 'var(--text-muted)');
        return '<tr><td><input type="checkbox" class="mb-check" data-code="' + e.code + '" data-price="' + (isGrid ? (e.price || 0) : (latest ? latest.c : 0)) + '" ' + disabled + '></td>' +
            '<td><strong>' + e.code + '</strong></td><td>' + e.name + heldLabel + '</td><td>¥' + price + '</td>' +
            '<td style="color:' + cpColor + '">' + cp + '%</td>' +
            '<td><input type="number" class="mb-amount" data-code="' + e.code + '" value="' + Math.round(config.initialCapital * (config.positionRatio || 0.3)) + '" min="1000" step="1000" style="width:100px;padding:4px 8px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:4px;font-size:12px;" ' + disabled + '></td></tr>';
    }).join('');
    const html = '<div class="config-overlay" id="manualBuyOverlay" onclick="if(event.target===this) hideManualBuy()">' +
        '<div class="config-panel" style="width:680px;"><h3>🛒 手动买入 ETF（可多选）</h3>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">可用现金：¥' + formatNumber(cash, 2) + ' | ' + (activeStrategyId === 'three_factor' ? '总资产上限：' + (config.maxTotalPct * 100) + '%' : '网格策略') + ' | 勾选后输入各自金额</div>' +
        '<div style="max-height:360px;overflow-y:auto;"><table class="data-table" style="font-size:12px;">' +
        '<thead><tr><th style="width:30px;">选</th><th>代码</th><th>名称</th><th>现价</th><th>' + (isGrid ? '位置%' : '综合P') + '</th><th>金额(元)</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="config-actions" style="margin-top:12px;"><button class="btn-sim btn-save" onclick="execManualBuy()">✅ 批量买入</button><button class="btn-sim btn-cancel" onclick="hideManualBuy()">✖ 取消</button></div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
}

function hideManualBuy() { const el = document.getElementById('manualBuyOverlay'); if (el) el.remove(); }

function execManualBuy() {
    const checks = document.querySelectorAll('.mb-check:checked');
    if (checks.length === 0) { alert('请至少勾选一只ETF'); return; }
    const config = getSimConfig();
    const lastSnapshot = getSimSnapshots().slice(-1)[0];
    let cash = lastSnapshot ? lastSnapshot.cash : config.initialCapital;
    const date = appData.target_date || new Date().toISOString().slice(0, 10);
    const isGrid = activeStrategyId === 'grid';
    let successCount = 0;
    for (const cb of checks) {
        const code = cb.dataset.code;
        const price = +cb.dataset.price;
        const amountInput = document.querySelector('.mb-amount[data-code="' + code + '"]');
        const amount = amountInput ? +amountInput.value : 0;
        if (!amount || amount < 1000) continue;
        const etfData = appData.etfs.find(e => e.code === code);
        // 网格策略不做严格 latest 检查
        if (!etfData) continue;
        if (!isGrid && !etfData.latest) continue;
        const actualAmount = Math.min(amount, cash * 0.95);
        const fee = Math.max(5, actualAmount * config.feeRate);
        const shares = Math.floor((actualAmount - fee) / price / 100) * 100;
        if (shares < 100) continue;
        const result = executeTrade({ action: 'BUY', code, name: etfData.name, reason: '手动买入' }, price, date);
        if (result) { cash = result.cash; successCount++; }
    }
    hideManualBuy();
    if (successCount > 0) { renderSimulator(); } else { alert('没有成功买入任何ETF（资金不足或数据异常）'); }
}

// ========== 手动卖出持仓 ==========
function execSellPosition(code, name, sellInputId) {
    // 读取输入框中的卖出份数
    let sellShares = 0;
    if (sellInputId) {
        const input = document.getElementById(sellInputId);
        if (input) sellShares = parseInt(input.value) || 0;
    }
    // 如果没有有效输入或输入框不存在，回退到全部卖出
    if (!sellShares || sellShares < 100) {
        const pos = getSimPositions().find(p => p.code === code);
        sellShares = pos ? pos.shares : 0;
    }
    if (sellShares < 100) { alert('卖出份数不足1手'); return; }

    if (!confirm('确定卖出 ' + code + ' ' + name + ' ' + sellShares + '份？')) return;
    if (!appData || !appData.etfs) return;
    const etfData = appData.etfs.find(e => e.code === code);
    if (!etfData) return;
    const price = etfData.price || (etfData.latest ? etfData.latest.c : null);
    if (!price) return;
    const date = appData.target_date || new Date().toISOString().slice(0, 10);
    // 调用部分卖出
    const result = executePartialSell(code, name, price, date, sellShares, '手动卖出');
    if (result) { renderSimulator(); } else { alert('卖出失败'); }
}

// ========== 历史回测弹窗 ==========
function showBacktest() {
    const strategyId = activeStrategyId;

    // 网格策略专用回测弹窗
    if (strategyId === 'grid') {
        const config = getSimConfig();
        const today = new Date().toISOString().slice(0, 10);
        const html = '<div class="config-overlay" id="backtestOverlay" onclick="if(event.target===this) hideBacktest()">' +
            '<div class="config-panel" style="width:560px;"><h3>📊 网格策略历史回测</h3>' +
            '<div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">基于历史K线+网格参数模拟自动交易</div>' +
            '<div class="config-section"><label>ETF代码<select id="bt_grid_code" style="width:100%;padding:8px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;">' +
            '<option value="510300" selected>510300 华泰柏瑞沪深300ETF</option>' +
            '<option value="510050">510050 华夏上证50ETF</option>' +
            '<option value="510500">510500 华泰柏瑞中证500ETF</option>' +
            '<option value="159919">159919 嘉实沪深300ETF</option>' +
            '<option value="510310">510310 易方达沪深300ETF</option>' +
            '<option value="510330">510330 华夏沪深300ETF</option>' +
            '<option value="512100">512100 南方中证1000ETF</option>' +
            '</select></label></div>' +
            '<div class="config-section"><label>回测天数<select id="bt_days" style="width:100%;padding:8px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;">' +
            '<option value="60">近60天</option><option value="120">近120天</option><option value="250" selected>近250天(约1年)</option></select></label></div>' +
            '<div class="config-section"><label>网格区间(%) <input id="bt_gridRangePct" type="number" value="' + (config.gridRangePct || 10) + '" min="5" max="30" style="width:100%;"></label></div>' +
            '<div class="config-section"><label>网格间距(%) <input id="bt_gridSpacingPct" type="number" value="' + (config.gridSpacingPct || 4.0) + '" min="0.5" max="10" step="0.1" style="width:100%;"></label></div>' +
            '<div class="config-section"><label>底仓比例(%) <input id="bt_basePositionPct" type="number" value="' + (config.basePositionPct || 50) + '" min="10" max="80" style="width:100%;"></label></div>' +
            '<div class="config-section"><label>预留现金(%) <input id="bt_reservePct" type="number" value="' + (config.reservePct || 10) + '" min="0" max="30" style="width:100%;"></label></div>' +
            '<div class="config-section"><label>初始资金(万) <input id="bt_capital" type="number" value="' + (config.initialCapital / 10000) + '" min="1" max="100" step="0.5" style="width:100%;"></label></div>' +
            '<div class="config-actions"><button class="btn-sim btn-save" onclick="execGridBacktest()">🚀 开始回测</button><button class="btn-sim btn-cancel" onclick="hideBacktest()">✖ 取消</button></div>' +
            '<div id="backtestResult" style="margin-top:16px;"></div></div></div>';
        document.body.insertAdjacentHTML('beforeend', html);
        return;
    }

    // 三因子回测弹窗
    let dateRange = '--';
    if (appData && appData.etfs) {
        const histories = appData.etfs.map(e => e.history).filter(h => h && h.length > 0);
        if (histories.length > 0) {
            const allDates = [...new Set(histories.flatMap(h => h.map(r => r.d)))].sort();
            dateRange = allDates[0] + ' ~ ' + allDates[allDates.length - 1] + ' (' + allDates.length + '天可分析)';
        }
    }
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const minDate = '2024-09-11';
    const html = '<div class="config-overlay" id="backtestOverlay" onclick="if(event.target===this) hideBacktest()">' +
        '<div class="config-panel" style="width:560px;"><h3>📊 历史回测</h3>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">基于历史三因子信号模拟交易，评估策略效果<br>当前已分析：' + dateRange + '</div>' +
        '<div class="config-section"><label>回测方式<select id="bt_mode" onchange="toggleBtMode()" style="width:100%;padding:8px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;">' +
        '<option value="days" selected>按天数</option><option value="custom">🔢 自定义日期区间</option></select></label></div>' +
        '<div id="bt_days_group" class="config-section"><label>回测天数<select id="bt_days" style="width:100%;padding:8px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;">' +
        '<option value="7">近7天</option><option value="14">近14天</option><option value="30" selected>近30天</option><option value="60">近60天</option><option value="120">近120天</option><option value="200">近200天(最大)</option></select></label></div>' +
        '<div id="bt_custom_group" class="config-section" style="display:none;">' +
        '<label>起始日期 <input id="bt_startDate" type="date" value="' + monthAgo + '" min="' + minDate + '" max="' + today + '" style="width:100%;padding:8px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;"></label>' +
        '<label style="margin-top:8px;">结束日期 <input id="bt_endDate" type="date" value="' + today + '" min="' + minDate + '" max="' + today + '" style="width:100%;padding:8px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;"></label>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">可选范围：' + minDate + ' ~ ' + today + '（API数据上限约200天）</div></div>' +
        '<div class="config-section"><label>建仓比例(%) <input id="bt_positionRatio" type="number" value="30" min="10" max="80" style="width:100%;"></label></div>' +
        '<div class="config-section"><label>买入阈值(综合P≥%)<select id="bt_buyThreshold" style="width:100%;padding:8px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;">' +
        '<option value="50">50% (中等+)</option><option value="70" selected>70% (高确信)</option></select></label></div>' +
        '<div class="config-actions"><button class="btn-sim btn-save" onclick="execBacktest()">🚀 开始回测</button><button class="btn-sim btn-cancel" onclick="hideBacktest()">✖ 取消</button></div>' +
        '<div id="backtestResult" style="margin-top:16px;"></div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
}

// 网格回测执行
async function execGridBacktest() {
    const resultDiv = document.getElementById('backtestResult');
    if (!resultDiv) return;
    resultDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">⏳ 回测中...</div>';
    const code = document.getElementById('bt_grid_code').value;
    const days = +document.getElementById('bt_days').value;
    const body = JSON.stringify({
        code: code,
        days: days,
        initial_capital: (+document.getElementById('bt_capital').value) * 10000,
        grid_range_pct: +document.getElementById('bt_gridRangePct').value,
        grid_spacing_pct: +document.getElementById('bt_gridSpacingPct').value,
        base_position_pct: +document.getElementById('bt_basePositionPct').value,
        reserve_pct: +document.getElementById('bt_reservePct').value,
        fee_rate: 0.00025,
    });
    try {
        const resp = await fetch('/api/strategy/grid/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        const data = await resp.json();
        if (data.error) { resultDiv.innerHTML = '<div style="color:var(--signal-high);">❌ ' + data.error + '</div>'; return; }
        const retColor = data.total_return >= 0 ? 'var(--signal-low)' : 'var(--signal-high)';
        const retSign = data.total_return >= 0 ? '+' : '';
        resultDiv.innerHTML = '<div style="background:var(--bg-secondary);border-radius:8px;padding:16px;">' +
            '<h4 style="margin-bottom:12px;color:var(--text-primary);">📈 网格回测结果</h4>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">' +
            '<div>📅 数据区间</div><div>' + (data.data_start_date || '') + ' ~ ' + (data.data_end_date || '') + '</div>' +
            '<div>💰 初始资金</div><div>¥' + formatNumber(data.initial_capital, 0) + '</div>' +
            '<div>📊 最终资产</div><div style="color:' + retColor + ';font-weight:700;">¥' + formatNumber(data.final_value, 2) + '</div>' +
            '<div>📈 总收益</div><div style="color:' + retColor + ';font-weight:700;">' + retSign + data.total_return + '%</div>' +
            '<div>🔢 交易次数</div><div>' + data.total_trades + '笔 (' + data.buy_count + '买/' + data.sell_count + '卖)</div>' +
            '<div>🎯 胜率</div><div>' + data.win_rate + '%</div>' +
            '<div>📉 最大回撤</div><div style="color:var(--signal-high);">' + data.max_drawdown + '%</div>' +
            '<div>📐 夏普比</div><div>' + data.sharpe + '</div></div>' +
            (data.grid_params ? '<div style="margin-top:12px;font-size:12px;color:var(--text-secondary);border-top:1px solid var(--border-default);padding-top:8px;">' +
                '📏 网格区间: ' + data.grid_params.low + ' ~ ' + data.grid_params.high + ' | 间距: ' + data.grid_params.spacing +
                ' | 层数: ' + data.grid_params.layers + ' | 每格: ' + data.grid_params.per_grid_shares + '股' + '</div>' : '') +
            (data.trades && data.trades.length > 0 ? '<div style="margin-top:12px;max-height:200px;overflow-y:auto;"><table class="data-table" style="font-size:11px;">' +
                '<thead><tr><th>日期</th><th>操作</th><th>价格</th><th>股数</th><th>金额</th><th>原因</th></tr></thead><tbody>' +
                data.trades.map(t => {
                    const isBuy = t.action === 'BUY';
                    return '<tr><td>' + t.date + '</td><td style="color:' + (isBuy ? 'var(--signal-low)' : 'var(--signal-high)') + ';font-weight:600;">' + (isBuy ? '买' : '卖') + '</td>' +
                        '<td>' + t.price.toFixed(3) + '</td><td>' + t.shares + '</td><td>' + t.amount.toFixed(2) + '</td><td style="font-size:10px;">' + (t.reason || '') + '</td></tr>';
                }).join('') + '</tbody></table></div>' : '') + '</div>';
    } catch (err) {
        resultDiv.innerHTML = '<div style="color:var(--signal-high);">❌ 回测失败: ' + err.message + '</div>';
    }
}

function toggleBtMode() {
    const mode = document.getElementById('bt_mode').value;
    document.getElementById('bt_days_group').style.display = mode === 'days' ? 'block' : 'none';
    document.getElementById('bt_custom_group').style.display = mode === 'custom' ? 'block' : 'none';
}

function hideBacktest() { const el = document.getElementById('backtestOverlay'); if (el) el.remove(); }

async function execBacktest() {
    const resultDiv = document.getElementById('backtestResult');
    if (!resultDiv) return;
    resultDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">⏳ 回测中...</div>';
    const btMode = document.getElementById('bt_mode').value;
    const positionRatio = (+document.getElementById('bt_positionRatio').value) / 100;
    const buyThreshold = +document.getElementById('bt_buyThreshold').value;
    let body;
    if (btMode === 'custom') {
        body = JSON.stringify({
            start_date: document.getElementById('bt_startDate').value,
            end_date: document.getElementById('bt_endDate').value,
            position_ratio: positionRatio, buy_threshold: buyThreshold
        });
    } else {
        body = JSON.stringify({
            days: +document.getElementById('bt_days').value,
            position_ratio: positionRatio, buy_threshold: buyThreshold
        });
    }
    try {
        const resp = await fetch('/api/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        const data = await resp.json();
        if (data.error) { resultDiv.innerHTML = '<div style="color:var(--signal-high);">❌ ' + data.error + '</div>'; return; }
        const retColor = data.total_return >= 0 ? 'var(--signal-low)' : 'var(--signal-high)';
        const retSign = data.total_return >= 0 ? '+' : '';
        const benchColor = data.benchmark_return >= 0 ? 'var(--signal-low)' : 'var(--signal-high)';
        const benchSign = data.benchmark_return >= 0 ? '+' : '';
        const alpha = data.total_return - (data.benchmark_return || 0);
        const alphaColor = alpha >= 0 ? 'var(--signal-low)' : 'var(--signal-high)';
        const alphaSign = alpha >= 0 ? '+' : '';
        const warningHtml = data.warning ? '<div style="background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.3);border-radius:6px;padding:8px;margin-bottom:12px;font-size:12px;color:#ffc107;">⚠️ ' + data.warning + '</div>' : '';

        // 构建权益曲线图容器
        const chartId = 'bt_equity_chart_' + Date.now();

        resultDiv.innerHTML = '<div style="background:var(--bg-secondary);border-radius:8px;padding:16px;">' +
            '<h4 style="margin-bottom:12px;color:var(--text-primary);">📈 回测结果</h4>' + warningHtml +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">' +
            '<div>📅 回测区间</div><div>' + data.start_date + ' ~ ' + data.end_date + '</div>' +
            '<div>💰 初始资金</div><div>¥' + formatNumber(data.initial_capital, 0) + '</div>' +
            '<div>📊 最终资产</div><div style="color:' + retColor + ';font-weight:700;">¥' + formatNumber(data.final_value, 2) + '</div>' +
            '<div>📈 策略收益</div><div style="color:' + retColor + ';font-weight:700;">' + retSign + data.total_return + '%</div>' +
            '<div>📉 基准收益</div><div style="color:' + benchColor + ';">' + benchSign + (data.benchmark_return || 0) + '% (沪深300)</div>' +
            '<div>⭐ 超额收益</div><div style="color:' + alphaColor + ';font-weight:700;">' + alphaSign + alpha.toFixed(2) + '%</div>' +
            '<div>🔢 交易次数</div><div>' + data.total_trades + '笔 (' + data.buy_count + '买/' + data.sell_count + '卖)</div>' +
            '<div>🎯 胜率</div><div>' + data.win_rate + '% (' + data.win_count + '/' + data.total_trades + ')</div>' +
            '<div>📉 最大回撤</div><div style="color:var(--signal-high);">' + data.max_drawdown + '%</div>' +
            '<div>📐 夏普比</div><div>' + data.sharpe + '</div></div>' +
            // 权益曲线图
            (data.equity_curve && data.equity_curve.length > 0 ? '<div id="' + chartId + '" style="width:100%;height:280px;margin-top:16px;"></div>' : '') +
            // 持仓明细
            (data.equity_curve && data.equity_curve.some(e => e.positions && e.positions.length > 0) ?
            '<div style="margin-top:12px;"><h5 style="color:var(--text-primary);margin-bottom:8px;">📋 持仓演变（最近10天有持仓的日期）</h5>' +
            '<div style="max-height:200px;overflow-y:auto;"><table class="data-table" style="font-size:11px;">' +
            '<thead><tr><th>日期</th><th>代码</th><th>名称</th><th>持仓</th><th>市值</th><th>权重</th><th>盈亏</th><th>持有天数</th></tr></thead><tbody>' +
            data.equity_curve.filter(e => e.positions && e.positions.length > 0).slice(-10).reverse().map(e =>
                e.positions.map(p => '<tr><td>' + e.date + '</td><td>' + p.code + '</td><td>' + (p.name || '') + '</td>' +
                '<td>' + p.shares + '股</td><td>¥' + formatNumber(p.market_value, 0) + '</td>' +
                '<td>' + p.weight_pct + '%</td><td style="color:' + (p.pnl_pct >= 0 ? 'var(--signal-low)' : 'var(--signal-high)') + '">' + (p.pnl_pct >= 0 ? '+' : '') + p.pnl_pct + '%</td>' +
                '<td>' + p.hold_days + '天</td></tr>').join('')
            ).join('') + '</tbody></table></div></div>' : '') +
            // 交易记录（完整，可滚动）
            (data.trades && data.trades.length > 0 ? '<div style="margin-top:12px;"><h5 style="color:var(--text-primary);margin-bottom:8px;">📜 交易记录（共' + data.trades.length + '笔）</h5>' +
            '<div style="max-height:300px;overflow-y:auto;"><table class="data-table" style="font-size:11px;">' +
                '<thead><tr><th>日期</th><th>操作</th><th>代码</th><th>名称</th><th>价格</th><th>份数</th><th>盈亏</th><th>原因</th></tr></thead><tbody>' +
                data.trades.map(t => {
                    const isBuy = t.action === 'BUY';
                    const actionColor = isBuy ? 'var(--signal-low)' : 'var(--signal-high)';
                    const pnlStr = t.pnl != null ? (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(2) : '--';
                    return '<tr><td>' + t.date + '</td><td style="color:' + actionColor + ';font-weight:600;">' + (isBuy ? '买' : '卖') + '</td>' +
                        '<td>' + t.code + '</td><td>' + (t.name || '') + '</td><td>' + t.price.toFixed(3) + '</td><td>' + t.shares + '</td><td>' + pnlStr + '</td><td style="font-size:10px;">' + (t.reason || '') + '</td></tr>';
                }).join('') + '</tbody></table></div></div>' : '') + '</div>';

        // 渲染权益曲线图
        if (data.equity_curve && data.equity_curve.length > 0 && typeof echarts !== 'undefined') {
            setTimeout(() => {
                const chartDom = document.getElementById(chartId);
                if (!chartDom) return;
                const chart = echarts.init(chartDom);
                const dates = data.equity_curve.map(e => e.date);
                const strategyVals = data.equity_curve.map(e => e.total_value);
                const benchVals = data.equity_curve.map(e => e.benchmark_value);
                chart.setOption({
                    tooltip: { trigger: 'axis' },
                    legend: { data: ['策略权益', '沪深300基准'], top: 0, textStyle: { color: '#aaa', fontSize: 11 } },
                    grid: { left: 60, right: 20, top: 30, bottom: 30 },
                    xAxis: { type: 'category', data: dates, axisLabel: { color: '#888', fontSize: 10, rotate: 45 } },
                    yAxis: { type: 'value', axisLabel: { color: '#888', fontSize: 10, formatter: v => '¥' + (v / 10000).toFixed(1) + '万' } },
                    series: [
                        { name: '策略权益', type: 'line', data: strategyVals, smooth: true, lineStyle: { color: '#4fc3f7', width: 2 }, itemStyle: { color: '#4fc3f7' }, symbol: 'none' },
                        { name: '沪深300基准', type: 'line', data: benchVals, smooth: true, lineStyle: { color: '#ff8a65', width: 1.5, type: 'dashed' }, itemStyle: { color: '#ff8a65' }, symbol: 'none' }
                    ]
                });
                window.addEventListener('resize', () => chart.resize());
            }, 300);
        }
    } catch (err) {
        resultDiv.innerHTML = '<div style="color:var(--signal-high);">❌ 回测失败: ' + err.message + '</div>';
    }
}

// ========== 云端同步 ==========
async function syncSimSave() {
    try {
        const sid = activeStrategyId || 'three_factor';
        const data = {
            config: getSimConfig(),
            trades: getSimTrades(),
            snapshots: getSimSnapshots(),
            positions: getSimPositions(),
            savedAt: new Date().toISOString(),
            strategy: sid,
        };
        const resp = await fetch('/api/sim/save?strategy=' + sid, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await resp.json();
        if (result.error) {
            alert('保存失败: ' + result.error);
        } else {
            const strategyName = StrategyRegistry.get(sid).name;
            alert('✅ [' + strategyName + '] 已保存到 ' + result.message + '\n请手动 git add userdata/ && git commit && git push 同步到 GitHub');
        }
    } catch (err) {
        alert('保存失败: ' + err.message);
    }
}

async function syncSimLoad() {
    try {
        const sid = activeStrategyId || 'three_factor';
        const resp = await fetch('/api/sim/load?strategy=' + sid);
        const result = await resp.json();
        if (result.error) {
            alert('加载失败: ' + result.error);
            return;
        }
        if (!result.data) {
            alert('暂无存档数据，请先在其他设备上执行"保存到本地"并 git push');
            return;
        }
        const strategyName = StrategyRegistry.get(sid).name;
        if (!confirm('[' + strategyName + '] 将用存档数据覆盖当前模拟盘，确定继续？\n存档时间: ' + (result.data.savedAt || '未知'))) return;
        
        localStorage.setItem(_simKey('config'), JSON.stringify(result.data.config || {}));
        localStorage.setItem(_simKey('trades'), JSON.stringify(result.data.trades || []));
        localStorage.setItem(_simKey('snapshots'), JSON.stringify(result.data.snapshots || []));
        localStorage.setItem(_simKey('positions'), JSON.stringify(result.data.positions || []));
        renderSimulator();
        alert('✅ [' + strategyName + '] 已从本地文件恢复模拟盘数据');
    } catch (err) {
        alert('加载失败: ' + err.message);
    }
}

// ========== 从主刷新流程调用 ==========
function updateSimulator(analysisData) {
    if (!analysisData || !analysisData.etfs) return;
    const config = getSimConfig();
    const date = analysisData.target_date || new Date().toISOString().slice(0, 10);
    const { positions } = initSimulator();

    // 网格策略：从 position_pct / recent_signal 生成建议 + 自动交易
    if (activeStrategyId === 'grid') {
        const gridSuggestions = generateGridSuggestions(analysisData, positions);
        window._lastSimSuggestions = { suggestions: gridSuggestions, stats: buildGridStats(analysisData, positions) };

        // auto/semi 模式按同日去重执行（同一天同一ETF不重复买卖）
        if (config.tradeMode === 'auto' && gridSuggestions.length > 0) {
            const todayTrades = getSimTrades().filter(t => t.date === date);
            for (const sug of gridSuggestions) {
                // 过滤同日已交易
                const alreadyTradedToday = todayTrades.some(t => t.code === sug.code && t.action === sug.action);
                if (alreadyTradedToday) continue;
                const etfData = analysisData.etfs.find(e => e.code === sug.code);
                if (etfData && etfData.price) executeTrade(sug, etfData.price, date);
            }
        } else if (config.tradeMode === 'semi') {
            const todayTrades = getSimTrades().filter(t => t.date === date);
            for (const sug of gridSuggestions.filter(s => s.action === 'SELL')) {
                const alreadySoldToday = todayTrades.some(t => t.code === sug.code && t.action === 'SELL');
                if (alreadySoldToday) continue;
                const etfData = analysisData.etfs.find(e => e.code === sug.code);
                if (etfData && etfData.price) executeTrade(sug, etfData.price, date);
            }
        }
        renderSimulator();
        return;
    }

    const settlement = settleHoldings(analysisData, date);
    const cash = settlement.cash || config.initialCapital;
    const sellSuggestions = checkSellSignals(positions, analysisData);
    const buySuggestions = checkBuySignals(analysisData, cash, positions);
    const allSuggestions = [...sellSuggestions, ...buySuggestions];
    allSuggestions.sort((a, b) => (a.priority || 99) - (b.priority || 99));
    window._lastSimSuggestions = { suggestions: allSuggestions, stats: buildThreeFactorStats(analysisData, positions, cash) };
    if (config.tradeMode === 'auto' && allSuggestions.length > 0) {
        for (const sug of allSuggestions) {
            const etfData = analysisData.etfs.find(e => e.code === sug.code);
            if (etfData && etfData.latest) executeTrade(sug, etfData.latest.c, date);
        }
    } else if (config.tradeMode === 'semi') {
        for (const sug of sellSuggestions) {
            const etfData = analysisData.etfs.find(e => e.code === sug.code);
            if (etfData && etfData.latest) executeTrade(sug, etfData.latest.c, date);
        }
    }
    renderSimulator();
}

// 网格策略交易建议生成
function generateGridSuggestions(analysisData, positions) {
    const suggestions = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const etf of analysisData.etfs) {
        if (etf.error) continue;

        const pos = etf.position_pct || 50;
        const sig = etf.recent_signal;
        const alreadyHeld = positions.find(p => p.code === etf.code);

        const g = etf.grid || {};
        const gridInfo = `区间${g.low?.toFixed(3)||'--'}~${g.high?.toFixed(3)||'--'} 第${etf.current_level}/${g.layers}层 间距${g.spacing?.toFixed(3)||'--'} 波动率${etf.annual_vol}%`;
        const curPrice = etf.price ? `¥${etf.price.toFixed(3)}` : '--';

        // 卖出信号：位置≥80% 且持有中
        if (pos >= 80 && alreadyHeld) {
            suggestions.push({
                code: etf.code, name: etf.name, action: 'SELL',
                reason: `区间顶部(${pos}%)卖出 ${etf.name}(${etf.code}) ${curPrice} | ${gridInfo}`,
                priority: 1, urgent: true,
            });
        }
        // 买入信号：位置≤20% 且未持有
        else if (pos <= 20 && !alreadyHeld) {
            suggestions.push({
                code: etf.code, name: etf.name, action: 'BUY',
                reason: `区间底部(${pos}%)买入 ${etf.name}(${etf.code}) ${curPrice} | ${gridInfo}`,
                priority: 1,
            });
        }
        // 最近信号买入且今天 且未持有
        else if (sig && sig.action === 'BUY' && sig.date === today && !alreadyHeld) {
            suggestions.push({
                code: etf.code, name: etf.name, action: 'BUY',
                reason: `网格下线触发买入 ${etf.name}(${etf.code}) @${sig.price?.toFixed(3)||curPrice} | ${gridInfo}`,
                priority: 2,
            });
        }
        // 最近信号卖出且今天 且持有中
        else if (sig && sig.action === 'SELL' && sig.date === today && alreadyHeld) {
            suggestions.push({
                code: etf.code, name: etf.name, action: 'SELL',
                reason: `网格上线触发卖出 ${etf.name}(${etf.code}) @${sig.price?.toFixed(3)||curPrice} | ${gridInfo}`,
                priority: 2, urgent: true,
            });
        }
        // 偏离中枢建议
        else if (pos >= 70 && alreadyHeld) {
            suggestions.push({
                code: etf.code, name: etf.name, action: 'SELL',
                reason: `偏离中枢(${pos}%)减仓 ${etf.name}(${etf.code}) ${curPrice} | ${gridInfo}`,
                priority: 3,
            });
        }
        else if (pos <= 30 && !alreadyHeld) {
            suggestions.push({
                code: etf.code, name: etf.name, action: 'BUY',
                reason: `偏离中枢(${pos}%)关注 ${etf.name}(${etf.code}) ${curPrice} | ${gridInfo}`,
                priority: 3,
            });
        }
    }

    suggestions.sort((a, b) => (a.priority || 99) - (b.priority || 99));
    return suggestions;
}

function buildThreeFactorStats(analysisData, positions, cash) {
    const etfs = analysisData.etfs || [];
    const total = etfs.filter(e => !e.error).length;
    const high = etfs.filter(e => e.latest && e.latest.cp >= 70).length;
    const mid = etfs.filter(e => e.latest && e.latest.cp >= 50 && e.latest.cp < 70).length;
    const low = total - high - mid;
    const held = positions.length;
    const mv = positions.reduce((s, p) => s + (p.marketValue || 0), 0);
    const tv = (cash || 0) + mv;
    const usedPct = tv > 0 ? Math.round(mv / tv * 100) : 0;
    return { type: 'three_factor', total, high, mid, low, held, usedPct, date: analysisData.target_date };
}

function buildGridStats(analysisData, positions) {
    const etfs = analysisData.etfs || [];
    const valid = etfs.filter(e => !e.error);
    const top = valid.filter(e => (e.position_pct || 50) >= 80).length;
    const bottom = valid.filter(e => (e.position_pct || 50) <= 20).length;
    const mid = valid.length - top - bottom;
    const held = positions.length;
    const avgVol = valid.length ? (valid.reduce((s, e) => s + (e.annual_vol || 0), 0) / valid.length).toFixed(1) : '--';
    return { type: 'grid', total: valid.length, top, bottom, mid, held, avgVol, date: analysisData.target_date };
}
