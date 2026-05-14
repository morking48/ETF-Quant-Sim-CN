/**
 * Tab3: 历史回溯视图
 * 日期选择器 + ECharts热力图 + 当日信号详情
 */

let historyData = null;
let heatmapChart = null;
let historyCurrentDate = null;
let historyDateList = [];

/**
 * 初始化历史视图
 */
function initHistory(data) {
    historyData = data;
    
    // 收集所有日期
    const dateSet = new Set();
    if (data && data.etfs) {
        data.etfs.forEach(etf => {
            if (etf.history) {
                etf.history.forEach(h => dateSet.add(h.d));
            }
        });
    }
    historyDateList = Array.from(dateSet).sort().reverse();
    
    if (historyDateList.length > 0) {
        historyCurrentDate = historyDateList[0];
    }
    
    renderHistory();
}

/**
 * 渲染历史视图
 */
function renderHistory() {
    if (!historyData || !historyDateList.length) {
        document.getElementById('historyDate').textContent = '--';
        return;
    }
    
    // 更新日期显示
    document.getElementById('historyDate').textContent = historyCurrentDate;
    
    // 更新汇总
    renderHistorySummary();
    
    // 渲染热力图
    renderHeatmap();
    
    // 渲染当日详情
    renderHistoryDetail();
}

/**
 * 更新历史汇总
 */
function renderHistorySummary() {
    let highCount = 0, midCount = 0;
    if (historyData && historyData.etfs) {
        historyData.etfs.forEach(etf => {
            if (etf.history) {
                const rec = etf.history.find(h => h.d === historyCurrentDate);
                if (rec) {
                    if (rec.cp >= 70) highCount++;
                    else if (rec.cp >= 50) midCount++;
                }
            }
        });
    }
    
    const el = document.getElementById('historySummary');
    if (el) {
        el.innerHTML = `🔴 ${highCount}只高确信 | 🟡 ${midCount}只中等 | 共${highCount+midCount}只触发`;
    }
}

/**
 * 渲染热力图 (ECharts heatmap)
 */
function renderHeatmap() {
    const dom = document.getElementById('chartHeatmap');
    if (!dom) return;
    
    if (!heatmapChart) {
        heatmapChart = echarts.init(dom);
        window.addEventListener('resize', () => heatmapChart && heatmapChart.resize());
    }
    
    if (!historyData || !historyData.etfs || historyData.etfs.length === 0) {
        heatmapChart.setOption({
            title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#64748b', fontSize: 14 } }
        });
        return;
    }
    
    // 取最近20个日期
    const recentDates = historyDateList.slice(0, 20).reverse();
    
    // 构建数据矩阵
    const etfNames = historyData.etfs.map(e => e.code);
    const data = [];
    
    historyData.etfs.forEach((etf, etfIdx) => {
        if (!etf.history) return;
        const histMap = {};
        etf.history.forEach(h => { histMap[h.d] = h; });
        
        recentDates.forEach((date, dateIdx) => {
            const rec = histMap[date];
            const cp = rec ? rec.cp : 0;
            data.push([dateIdx, etfIdx, cp]);
        });
    });
    
    const option = {
        backgroundColor: 'transparent',
        title: {
            text: '7×20 信号热力图',
            left: 'center',
            top: 8,
            textStyle: { color: '#8899aa', fontSize: 13, fontWeight: 600 }
        },
        tooltip: {
            position: 'top',
            formatter: function(params) {
                const etfName = etfNames[params.value[1]];
                const date = recentDates[params.value[0]];
                const cp = params.value[2];
                const si = getSignalInfo(cp);
                return `${etfName} | ${date}<br/>综合概率: ${cp.toFixed(1)}% ${si.icon}`;
            },
            backgroundColor: 'rgba(20, 27, 38, 0.95)',
            borderColor: 'rgba(56, 189, 248, 0.2)',
            textStyle: { color: '#e0e6f0', fontSize: 12 }
        },
        grid: { top: 40, right: 16, bottom: 30, left: 90 },
        xAxis: {
            type: 'category',
            data: recentDates.map(d => shortDate(d)),
            axisLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.15)' } },
            axisLabel: { color: '#64748b', fontSize: 10, rotate: 45 },
            splitArea: { show: true, areaStyle: { color: ['rgba(0,0,0,0.03)', 'rgba(0,0,0,0)'] } }
        },
        yAxis: {
            type: 'category',
            data: etfNames,
            axisLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.15)' } },
            axisLabel: { color: '#8899aa', fontSize: 11, fontWeight: 'bold' },
            splitArea: { show: true, areaStyle: { color: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.03)'] } }
        },
        visualMap: {
            min: 0, max: 100,
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: 0,
            textStyle: { color: '#8899aa', fontSize: 10 },
            inRange: {
                color: ['#1a2332', '#22c55e', '#f59e0b', '#ef4444']
            }
        },
        series: [{
            type: 'heatmap',
            data: data,
            label: {
                show: true,
                fontSize: 9,
                formatter: function(p) {
                    const v = p.value[2];
                    return v > 0 ? v.toFixed(0) : '';
                }
            },
            emphasis: {
                itemStyle: {
                    shadowBlur: 10,
                    shadowColor: 'rgba(56, 189, 248, 0.5)'
                }
            }
        }]
    };
    heatmapChart.setOption(option, true);
}

/**
 * 渲染当日信号详情列表
 */
function renderHistoryDetail() {
    const container = document.getElementById('historyDetailList');
    if (!container) return;
    
    if (!historyData || !historyData.etfs) {
        container.innerHTML = '<div style="color:var(--text-muted);text-align:center;grid-column:1/-1">暂无数据</div>';
        return;
    }
    
    const items = [];
    historyData.etfs.forEach(etf => {
        if (!etf.history) return;
        const rec = etf.history.find(h => h.d === historyCurrentDate);
        if (!rec) return;
        
        const si = getSignalInfo(rec.cp);
        const chgClass = getChgColorClass(rec.chg);
        
        items.push(`
            <div class="history-item" style="border-left: 3px solid ${si.color}">
                <div class="hi-code">${etf.code}</div>
                <div class="hi-name">${etf.name}</div>
                <div class="hi-signal">${si.icon}</div>
                <div class="hi-prob" style="color:${si.color}">${rec.cp.toFixed(0)}%</div>
                <div class="hi-factors">
                    <span>量能P:${rec.vp.toFixed(0)}%</span>
                    <span>方向P:${rec.dp.toFixed(0)}%</span>
                    <span>倍量:${rec.vr.toFixed(2)}x</span>
                </div>
                <div class="hi-factors" style="margin-top:2px">
                    <span class="${chgClass}">涨跌:${formatPercent(rec.chg)}</span>
                    <span>¥${rec.c.toFixed(3)}</span>
                </div>
            </div>
        `);
    });
    
    container.innerHTML = items.length > 0 ? items.join('') : 
        '<div style="color:var(--text-muted);text-align:center;grid-column:1/-1">该日期无数据</div>';
}

/**
 * 日期切换
 */
function navigateHistory(direction) {
    if (!historyDateList.length) return;
    
    const currentIdx = historyDateList.indexOf(historyCurrentDate);
    let newIdx = currentIdx;
    
    if (direction === 'prev') {
        newIdx = Math.min(currentIdx + 1, historyDateList.length - 1);
    } else {
        newIdx = Math.max(currentIdx - 1, 0);
    }
    
    if (newIdx !== currentIdx && newIdx >= 0) {
        historyCurrentDate = historyDateList[newIdx];
        renderHistory();
    }
}