/**
 * 策略选择器组件 — 顶部策略下拉框
 */
function initStrategySelector() {
    // 恢复上次选择的策略（此时所有策略已注册完毕）
    const saved = localStorage.getItem('etf_active_strategy');
    if (saved && StrategyRegistry._strategies[saved]) {
        activeStrategyId = saved;
    }

    const strategies = StrategyRegistry.list();
    const headerLeft = document.querySelector('.header-left');
    if (!headerLeft) return;

    // 移除旧的选择器
    const old = document.getElementById('strategySelector');
    if (old) old.remove();

    const select = document.createElement('select');
    select.id = 'strategySelector';
    select.style.cssText = 'margin-left:16px;padding:4px 12px;border-radius:6px;border:1px solid var(--border-default);background:var(--bg-card);color:var(--text-primary);font-size:13px;cursor:pointer;';

    strategies.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        if (s.id === activeStrategyId) opt.selected = true;
        select.appendChild(opt);
    });

    select.addEventListener('change', () => {
        const newId = select.value;
        if (newId === activeStrategyId) return;
        const strategyName = select.options[select.selectedIndex].text;
        showStrategySwitchConfirm(newId, strategyName);
    });

    headerLeft.appendChild(select);
}

// 更新策略描述
function updateStrategyDescription() {
    const s = getActiveStrategy();
    const subEl = document.getElementById('headerModelMode');
    if (subEl) subEl.textContent = s.description;
    const titleEl = document.querySelector('.header-left h1');
    if (titleEl) {
        titleEl.textContent = titleEl.textContent.replace(/^[^\s]+/, s.name.includes('三因子') ? '🛡️' : '🔄');
        titleEl.textContent = (s.name.includes('三因子') ? '🛡️ ' : '🔄 ') + s.name;
    }
}

// showBacktest() 由 sim_ui.js 统一提供UI模态框，按策略分叉调用后端

function showStrategySwitchConfirm(newId, strategyName) {
    const existing = document.getElementById('strategySwitchOverlay');
    if (existing) existing.remove();

    const html = '<div class="config-overlay" id="strategySwitchOverlay" onclick="if(event.target===this) hideStrategySwitchConfirm()">' +
        '<div class="config-panel" style="max-width:420px;">' +
        '<h3>🔄 切换策略确认</h3>' +
        '<div style="padding:16px 0;text-align:center;">' +
        '<p style="font-size:14px;color:var(--text-primary);margin-bottom:8px;">切换到 <strong style="color:var(--accent-blue);">' + strategyName + '</strong> ？</p>' +
        '<p style="font-size:12px;color:var(--signal-high);margin-bottom:4px;">⚠️ 模拟盘将被重置</p>' +
        '<p style="font-size:11px;color:var(--text-muted);">（持仓/交易记录/快照将清空，配置文件保留）</p></div>' +
        '<div class="config-actions">' +
        '<button class="btn-sim btn-save" id="btnSwitchConfirm">✅ 确认切换</button>' +
        '<button class="btn-sim btn-cancel" onclick="hideStrategySwitchConfirm()">✖ 取消</button>' +
        '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('btnSwitchConfirm').onclick = function() {
        setActiveStrategy(newId);
        hideStrategySwitchConfirm();
        resetSimulation();
        initSimulator();
        updateStrategyDescription();
        updateUIForStrategy(newId);
        if (typeof doRefresh === 'function') doRefresh();
    };
}

function hideStrategySwitchConfirm() {
    const el = document.getElementById('strategySwitchOverlay');
    if (el) el.remove();
    const select = document.getElementById('strategySelector');
    if (select && activeStrategyId) select.value = activeStrategyId;
}

function updateUIForStrategy(strategyId) {
    const gridDashboard = document.getElementById('gridDashboard');
    if (gridDashboard) gridDashboard.style.display = strategyId === 'grid' ? 'block' : 'none';
    const threeFactorPanel = document.getElementById('threeFactorPanel');
    if (threeFactorPanel) threeFactorPanel.style.display = strategyId === 'three_factor' ? 'block' : 'none';
}

// ========== 跨策略信号看板 ==========
function renderSignalDashboard(data) {
    const container = document.getElementById('signalDashboard');
    if (!container || !data || !data.strategies) return;
    container.style.display = 'block';

    const items = data.strategies.map(s => {
        const barWidth = Math.min(100, s.strength * 20);
        let color = 'var(--text-muted)';
        if (s.strength >= 4) color = 'var(--signal-low)';
        else if (s.strength >= 2) color = 'var(--signal-mid)';

        const isActive = (s.id === activeStrategyId);
        const borderStyle = isActive ? 'border: 1px solid var(--accent-blue);' : '';

        return '<div style="flex:1;min-width:200px;padding:8px 12px;background:var(--bg-secondary);border-radius:6px;' + borderStyle + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
            '<span style="font-weight:600;font-size:13px;color:var(--text-primary);">' +
            (s.id === 'three_factor' ? '🛡️ ' : '🔄 ') + s.name + '</span>' +
            (isActive ? '<span style="font-size:10px;background:var(--accent-blue);color:#fff;padding:1px 6px;border-radius:3px;">当前</span>' : '') +
            '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">' + (s.summary || '--') + '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
            '<div style="flex:1;height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden;">' +
            '<div style="width:' + barWidth + '%;height:100%;background:' + color + ';border-radius:3px;transition:width 0.4s ease;"></div></div>' +
            '<span style="font-size:12px;font-weight:700;color:' + color + ';min-width:45px;text-align:right;">' + s.label + '</span></div>' +
            (s.suggestion ? '<div style="font-size:10px;color:var(--text-muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">💡 ' + s.suggestion + '</div>' : '') +
            (s.id !== activeStrategyId && data.recommended === s.id ? '<button class="btn-sim btn-save" style="margin-top:6px;padding:2px 10px;font-size:11px;width:100%;" onclick="showStrategySwitchConfirm(\'' + s.id + '\',\'' + s.name + '\')">🔥 切换到此策略</button>' : '') +
            '</div>';
    }).join('');

    let recHtml = '';
    if (data.recommended && data.recommended !== activeStrategyId) {
        const recName = data.strategies.find(s => s.id === data.recommended)?.name || data.recommended;
        recHtml = '<div style="margin-left:12px;font-size:12px;color:var(--signal-mid);font-weight:600;white-space:nowrap;">🔥 推荐: ' + recName + '</div>';
    }

    container.innerHTML = '<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">' + items + '</div>' + recHtml;

    // 同步更新 header 右上角信号指示器
    renderHeaderSignals(data);
}

/**
 * Header 右上角紧凑信号指示器
 */
function renderHeaderSignals(data) {
    const el = document.getElementById('headerSignals');
    if (!el || !data || !data.strategies) return;

    const strengthEmoji = (s) => {
        if (s >= 5) return '🔥';
        if (s >= 4) return '🟢';
        if (s >= 3) return '🟡';
        if (s >= 2) return '🟠';
        return '⚪';
    };

    const items = data.strategies
        .filter(s => s.strength > 0)
        .map(s => {
            const icon = s.id === 'three_factor' ? '🛡️' : '🔄';
            const isActive = s.id === activeStrategyId;
            const style = isActive ? 'font-weight:700;color:var(--accent-blue);' : 'color:var(--text-secondary);';
            return '<span style="font-size:11px;margin-left:8px;' + style + 'cursor:pointer;" title="' + s.summary + '" onclick="document.getElementById(\'signalDashboard\').scrollIntoView({behavior:\'smooth\'})">' + icon + ' ' + strengthEmoji(s.strength) + '</span>';
        });

    if (items.length > 0) {
        el.style.display = '';
        el.innerHTML = items.join('');
    } else {
        el.style.display = 'none';
    }
}
