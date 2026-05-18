/**
 * Tab4: 模拟盘视图
 * 资产总览 + 收益曲线 + 持仓/交易建议 + 交易记录 + 策略配置
 */

let simEquityChart = null;

// ========== 策略配置面板 ==========
function showSimConfig() {
    const config = getSimConfig();
    const html = `
    <div class="config-overlay" id="configOverlay" onclick="if(event.target===this) hideSimConfig()">
    <div class="config-panel">
        <h3>⚙️ 模拟盘策略配置</h3>
        
        <div class="config-section">
            <h4>💰 资金设置</h4>
            <label>初始资金(元) <input id="cfg_capital" type="number" value="${config.initialCapital}" step="10000" min="5000"></label>
        </div>
        
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
    const config = {
        initialCapital: +document.getElementById('cfg_capital').value,
        positionRatio: (+document.getElementById('cfg_positionRatio').value) / 100,
        addRatio: (+document.getElementById('cfg_addRatio').value) / 100,
        maxSinglePct: (+document.getElementById('cfg_maxSinglePct').value) / 100,
        maxTotalPct: (+document.getElementById('cfg_maxTotalPct').value) / 100,
        stopLossPct: -(+(document.getElementById('cfg_stopLossPct').value)) / 100,
        timeStopDays: +document.getElementById('cfg_timeStopDays').value,
        signalSellPct: (+document.getElementById('cfg_signalSellPct').value) / 100,
        tradeMode: document.querySelector('input[name="cfg_tradeMode"]:checked').value,
        feeRate: (+document.getElementById('cfg_feeRate').value) / 10000,
    };
    saveSimConfig({...getSimConfig(), ...config});
    hideSimConfig();
    renderSimulator();
}

function resetConfigFromUI() {
    resetSimConfig();
    const config = getSimConfig();
    document.getElementById('cfg_capital').value = config.initialCapital;
    document.getElementById('cfg_positionRatio').value = Math.round(config.positionRatio * 100);
    document.getElementById('cfg_addRatio').value = Math.round(config.addRatio * 100);
    document.getElementById('cfg_maxSinglePct').value = Math.round(config.maxSinglePct * 100);
    document.getElementById('cfg_maxTotalPct').value = Math.round(config.maxTotalPct * 100);
    document.getElementById('cfg_stopLossPct').value = Math.round(config.stopLossPct * -100);
    document.getElementById('cfg_timeStopDays').value = config.timeStopDays;
    document.getElementById('cfg_signalSellPct').value = Math.round(config.signalSellPct * 100);
    document.querySelector('input[name="cfg_tradeMode"][value="manual"]').checked = true;
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
        return '<div class="sim-position-item">' +
            '<div class="sim-pos-header"><span class="sim-pos-code">' + p.code + '</span><span class="sim-pos-name">' + p.name + '</span></div>' +
            '<div class="sim-pos-detail"><div>成本 ¥' + (p.costPrice || 0).toFixed(3) + ' → 现价 ¥' + (p.currentPrice || 0).toFixed(3) + '</div>' +
            '<div>持有 ' + (p.shares || 0) + '份 | 市值 ¥' + formatNumber(p.marketValue || 0, 2) + '</div>' +
            '<div style="color:' + pnlColor + ';font-weight:700">' + pnlSign + '¥' + formatNumber(p.pnl || 0, 2) + ' (' + pnlSign + (p.pnlPct || 0).toFixed(1) + '%)</div></div>' +
            '<div class="sim-pos-footer"><span>持有' + (p.holdDays || 0) + '天</span>' +
            '<button class="btn-sim btn-reset" style="padding:2px 10px;font-size:10px;margin-left:8px;" onclick="execSellPosition(\'' + p.code + '\',\'' + p.name + '\')">🔴 卖出</button></div></div>';
    }).join('') + '<div class="sim-cash">💵 可用现金：¥' + formatNumber(cash, 2) + '</div>';
}

function renderSimSuggestions() {
    const container = document.getElementById('simSuggestions');
    if (!container) return;
    if (!window._lastSimSuggestions || window._lastSimSuggestions.length === 0) {
        container.innerHTML = '<div class="sim-empty">暂无交易建议（刷新数据后生成）</div>';
        return;
    }
    const config = getSimConfig();
    container.innerHTML = window._lastSimSuggestions.map(s => {
        const isBuy = s.action === 'BUY';
        const actionColor = isBuy ? 'var(--signal-low)' : 'var(--signal-high)';
        const actionLabel = isBuy ? '买入' : '卖出';
        return '<div class="sim-suggestion-item" style="border-left: 4px solid ' + actionColor + '">' +
            '<div class="sim-sug-header"><span style="color:' + actionColor + ';font-weight:700">' + (isBuy ? '🟢' : '🔴') + ' ' + actionLabel + '</span>' +
            '<span>' + s.code + ' ' + (s.name || '') + '</span>' +
            (s.urgent ? '<span style="color:var(--signal-high);font-size:11px">‼紧急</span>' : '') + '</div>' +
            '<div class="sim-sug-reason">' + s.reason + '</div>' +
            (config.tradeMode !== 'manual' ? '' : '<button class="btn-sim btn-exec" onclick="execSuggestion(\'' + s.action + '\',\'' + s.code + '\',\'' + s.name + '\',\'' + s.reason + '\')">✅ 确认执行</button>') +
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
    if (!etfData || !etfData.latest) return;
    const price = etfData.latest.c;
    const date = appData.target_date || new Date().toISOString().slice(0, 10);
    const result = executeTrade({ action, code, name, reason }, price, date);
    if (result) { renderSimulator(); } else { alert('交易执行失败：资金不足或数据异常'); }
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
    const rows = appData.etfs.map(e => {
        const latest = e.latest;
        const cp = latest ? latest.cp.toFixed(0) : '--';
        const price = latest ? latest.c.toFixed(3) : '--';
        const held = positions.find(p => p.code === e.code);
        const disabled = held ? 'disabled' : '';
        const heldLabel = held ? ' [已持有]' : '';
        const cpColor = cp >= 70 ? 'var(--signal-high)' : (cp >= 50 ? 'var(--signal-mid)' : 'var(--text-muted)');
        return '<tr><td><input type="checkbox" class="mb-check" data-code="' + e.code + '" data-price="' + (latest ? latest.c : 0) + '" ' + disabled + '></td>' +
            '<td><strong>' + e.code + '</strong></td><td>' + e.name + heldLabel + '</td><td>¥' + price + '</td>' +
            '<td style="color:' + cpColor + '">' + cp + '%</td>' +
            '<td><input type="number" class="mb-amount" data-code="' + e.code + '" value="' + Math.round(config.initialCapital * config.positionRatio) + '" min="1000" step="1000" style="width:100px;padding:4px 8px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:4px;font-size:12px;" ' + disabled + '></td></tr>';
    }).join('');
    const html = '<div class="config-overlay" id="manualBuyOverlay" onclick="if(event.target===this) hideManualBuy()">' +
        '<div class="config-panel" style="width:680px;"><h3>🛒 手动买入 ETF（可多选）</h3>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">可用现金：¥' + formatNumber(cash, 2) + ' | 总资产上限：' + (config.maxTotalPct * 100) + '% | 勾选后输入各自金额</div>' +
        '<div style="max-height:360px;overflow-y:auto;"><table class="data-table" style="font-size:12px;">' +
        '<thead><tr><th style="width:30px;">选</th><th>代码</th><th>名称</th><th>现价</th><th>综合P</th><th>金额(元)</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
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
    let successCount = 0;
    for (const cb of checks) {
        const code = cb.dataset.code;
        const price = +cb.dataset.price;
        const amountInput = document.querySelector('.mb-amount[data-code="' + code + '"]');
        const amount = amountInput ? +amountInput.value : 0;
        if (!amount || amount < 1000) continue;
        const etfData = appData.etfs.find(e => e.code === code);
        if (!etfData || !etfData.latest) continue;
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
function execSellPosition(code, name) {
    if (!confirm('确定卖出 ' + code + ' ' + name + ' 全部持仓？')) return;
    if (!appData || !appData.etfs) return;
    const etfData = appData.etfs.find(e => e.code === code);
    if (!etfData || !etfData.latest) return;
    const price = etfData.latest.c;
    const date = appData.target_date || new Date().toISOString().slice(0, 10);
    const result = executeTrade({ action: 'SELL', code, name, reason: '手动卖出' }, price, date);
    if (result) { renderSimulator(); } else { alert('卖出失败'); }
}

// ========== 历史回测弹窗 ==========
function showBacktest() {
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
    const minDate = '2024-09-11'; // 腾讯API已知最早日期
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
        const warningHtml = data.warning ? '<div style="background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.3);border-radius:6px;padding:8px;margin-bottom:12px;font-size:12px;color:#ffc107;">⚠️ ' + data.warning + '</div>' : '';
        resultDiv.innerHTML = '<div style="background:var(--bg-secondary);border-radius:8px;padding:16px;">' +
            '<h4 style="margin-bottom:12px;color:var(--text-primary);">📈 回测结果</h4>' + warningHtml +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">' +
            '<div>📅 回测区间</div><div>' + data.start_date + ' ~ ' + data.end_date + '</div>' +
            '<div>💰 初始资金</div><div>¥' + formatNumber(data.initial_capital, 0) + '</div>' +
            '<div>📊 最终资产</div><div style="color:' + retColor + ';font-weight:700;">¥' + formatNumber(data.final_value, 2) + '</div>' +
            '<div>📈 总收益</div><div style="color:' + retColor + ';font-weight:700;">' + retSign + data.total_return + '%</div>' +
            '<div>🔢 交易次数</div><div>' + data.total_trades + '笔 (' + data.buy_count + '买/' + data.sell_count + '卖)</div>' +
            '<div>🎯 胜率</div><div>' + data.win_rate + '% (' + data.win_count + '/' + data.total_trades + ')</div>' +
            '<div>📉 最大回撤</div><div style="color:var(--signal-high);">' + data.max_drawdown + '%</div>' +
            '<div>📐 夏普比</div><div>' + data.sharpe + '</div></div>' +
            (data.trades && data.trades.length > 0 ? '<div style="margin-top:12px;max-height:200px;overflow-y:auto;"><table class="data-table" style="font-size:11px;">' +
                '<thead><tr><th>日期</th><th>操作</th><th>代码</th><th>价格</th><th>份数</th><th>盈亏</th><th>原因</th></tr></thead><tbody>' +
                data.trades.map(t => {
                    const isBuy = t.action === 'BUY';
                    const actionColor = isBuy ? 'var(--signal-low)' : 'var(--signal-high)';
                    const pnlStr = t.pnl != null ? (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(2) : '--';
                    return '<tr><td>' + t.date + '</td><td style="color:' + actionColor + ';font-weight:600;">' + (isBuy ? '买' : '卖') + '</td>' +
                        '<td>' + t.code + '</td><td>' + t.price.toFixed(3) + '</td><td>' + t.shares + '</td><td>' + pnlStr + '</td><td style="font-size:10px;">' + (t.reason || '') + '</td></tr>';
                }).join('') + '</tbody></table></div>' : '') + '</div>';
    } catch (err) {
        resultDiv.innerHTML = '<div style="color:var(--signal-high);">❌ 回测失败: ' + err.message + '</div>';
    }
}

// ========== 云端同步 ==========
async function syncSimSave() {
    try {
        const data = {
            config: getSimConfig(),
            trades: getSimTrades(),
            snapshots: getSimSnapshots(),
            positions: getSimPositions(),
            savedAt: new Date().toISOString()
        };
        const resp = await fetch('/api/sim/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await resp.json();
        if (result.error) {
            alert('保存失败: ' + result.error);
        } else {
            alert('✅ 已保存到 ' + result.message + '\n请手动 git add userdata/ && git commit && git push 同步到 GitHub');
        }
    } catch (err) {
        alert('保存失败: ' + err.message);
    }
}

async function syncSimLoad() {
    try {
        const resp = await fetch('/api/sim/load');
        const result = await resp.json();
        if (result.error) {
            alert('加载失败: ' + result.error);
            return;
        }
        if (!result.data) {
            alert('暂无存档数据，请先在其他设备上执行"保存到本地"并 git push');
            return;
        }
        if (!confirm('将用存档数据覆盖当前模拟盘，确定继续？\n存档时间: ' + (result.data.savedAt || '未知'))) return;
        
        localStorage.setItem('etf_sim_config', JSON.stringify(result.data.config || {}));
        localStorage.setItem('etf_sim_trades', JSON.stringify(result.data.trades || []));
        localStorage.setItem('etf_sim_snapshots', JSON.stringify(result.data.snapshots || []));
        localStorage.setItem('etf_sim_positions', JSON.stringify(result.data.positions || []));
        renderSimulator();
        alert('✅ 已从本地文件恢复模拟盘数据');
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
    const settlement = settleHoldings(analysisData, date);
    const cash = settlement.cash || config.initialCapital;
    const sellSuggestions = checkSellSignals(positions, analysisData);
    const buySuggestions = checkBuySignals(analysisData, cash, positions);
    const allSuggestions = [...sellSuggestions, ...buySuggestions];
    allSuggestions.sort((a, b) => (a.priority || 99) - (b.priority || 99));
    window._lastSimSuggestions = allSuggestions;
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