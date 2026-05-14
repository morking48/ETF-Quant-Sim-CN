/**
 * 综合报告 Tab 渲染
 * 展示：综合评级、成交量排名、方向一致性、30日信号回溯
 */

function renderReport(analysis) {
    if (!analysis || !analysis.report) return;
    const r = analysis.report;

    // 1. 综合评级
    const ratingEl = document.getElementById('reportRating');
    if (ratingEl) {
        const avgCp = r.avg_cp || 0;
        const color = avgCp >= 70 ? '#e74c3c' : (avgCp >= 50 ? '#f39c12' : (avgCp >= 30 ? '#e67e22' : '#95a5a6'));
        ratingEl.innerHTML = `
            <div class="rating-card" style="border-left: 4px solid ${color};">
                <div class="rating-title">📋 综合评级</div>
                <div class="rating-value" style="color: ${color};">${r.rating || '--'}</div>
                <div class="rating-meta">
                    平均综合概率: <strong>${avgCp}%</strong> | 
                    分析日: ${analysis.target_date || '--'} | 
                    模式: ${analysis.mode === 'three_factor' ? '三因子' : '二因子'}
                </div>
            </div>
        `;
    }

    // 2. 成交量排名表
    const volBody = document.getElementById('reportVolumeBody');
    if (volBody && r.volume_ranking) {
        volBody.innerHTML = r.volume_ranking.map((item, i) => {
            const vrColor = item.vr >= 2.0 ? '#e74c3c' : (item.vr >= 1.5 ? '#e67e22' : (item.vr >= 1.0 ? '#f39c12' : '#27ae60'));
            const chgColor = item.chg > 0 ? '#e74c3c' : (item.chg < 0 ? '#27ae60' : '#95a5a6');
            const cpColor = item.cp >= 70 ? '#e74c3c' : (item.cp >= 50 ? '#f39c12' : '#95a5a6');
            return `<tr>
                <td><strong>${item.code}</strong></td>
                <td>${item.name}</td>
                <td>${item.index}</td>
                <td>${item.v.toFixed(0)}</td>
                <td>${item.vma.toFixed(0)}</td>
                <td style="color:${vrColor};font-weight:bold;">${item.vr.toFixed(2)}x</td>
                <td style="color:${chgColor};">${item.chg >= 0 ? '+' : ''}${item.chg.toFixed(2)}%</td>
                <td style="color:${cpColor};font-weight:bold;">${item.cp.toFixed(0)}%</td>
                <td><span class="tag tag-${item.label === '极端放量' ? 'danger' : (item.label === '显著放量' ? 'warning' : 'info')}">${item.label}</span></td>
            </tr>`;
        }).join('');
    }

    // 3. 方向一致性
    const dirEl = document.getElementById('reportDirection');
    if (dirEl && r.direction) {
        const d = r.direction;
        const consensusColor = d.consensus.includes('看多') ? '#e74c3c' : (d.consensus.includes('看空') ? '#27ae60' : '#f39c12');
        dirEl.innerHTML = `
            <div class="direction-card">
                <div class="direction-stats">
                    <div class="direction-stat up">
                        <span class="direction-num">${d.up}</span>
                        <span class="direction-label">上涨</span>
                    </div>
                    <div class="direction-stat down">
                        <span class="direction-num">${d.down}</span>
                        <span class="direction-label">下跌</span>
                    </div>
                    <div class="direction-stat flat">
                        <span class="direction-num">${d.flat}</span>
                        <span class="direction-label">平盘</span>
                    </div>
                </div>
                <div class="direction-consensus" style="color:${consensusColor};">
                    综合判断: <strong>${d.consensus}</strong>
                    ${d.up >= 7 ? ' — 放量ETF全线上涨，买入方向一致性极强' : ''}
                </div>
            </div>
        `;
    }

    // 4. 30日信号回溯
    const sigList = document.getElementById('reportSignalList');
    if (sigList && r.signal_backtrack) {
        if (r.signal_backtrack.length === 0) {
            sigList.innerHTML = '<div class="report-empty">ℹ️ 近30日无多ETF同步信号</div>';
        } else {
            sigList.innerHTML = r.signal_backtrack.map(s => {
                const highBadges = '🔴'.repeat(s.high);
                const midBadges = '🟡'.repeat(s.mid);
                return `<div class="signal-item">
                    <span class="signal-date">📅 ${s.date}</span>
                    <span class="signal-badges">${highBadges}${midBadges}</span>
                    <span class="signal-codes">${s.codes.join(', ')}</span>
                </div>`;
            }).join('');
        }
    }
}