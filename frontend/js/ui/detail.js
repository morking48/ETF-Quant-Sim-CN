/**
 * Tab2: 详情视图
 * 单ETF综合概率大卡片 + ECharts环形进度图 + 趋势折线图 + 数据表格
 */

let detailData = null;
let gaugeChartVp = null;
let gaugeChartDp = null;
let gaugeChartCp = null;
let trendChart = null;

/**
 * 切换到详情Tab并加载指定ETF
 */
function switchToDetail(code) {
    // 切换Tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const detailBtn = document.querySelector('[data-tab="detail"]');
    if (detailBtn) detailBtn.classList.add('active');
    
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const detailPanel = document.getElementById('panel-detail');
    if (detailPanel) detailPanel.classList.add('active');
    
    // 设置下拉选择
    const select = document.getElementById('detailSelect');
    if (select) select.value = code;
    
    // 加载数据
    loadDetail(code);
}

/**
 * 初始化详情页下拉框
 */
function initDetailSelect(etfs) {
    const select = document.getElementById('detailSelect');
    if (!select) return;
    
    select.innerHTML = etfs.map(etf => 
        `<option value="${etf.code}">${etf.code} ${etf.name}</option>`
    ).join('');
    
    select.addEventListener('change', () => {
        loadDetail(select.value);
    });
}

/**
 * 加载单ETF详情
 */
async function loadDetail(code) {
    try {
        const data = await apiGetSingleAnalysis(code);
        detailData = data;
        
        document.getElementById('detailName').textContent = data.name;
        document.getElementById('detailIndex').textContent = data.index;
        
        renderDetailProbCard(data.latest);
        renderGaugeChart(data.latest);
        renderTrendChart(data.history);
        renderDetailTable(data.history);
        
    } catch (err) {
        console.error('加载详情失败:', err);
        showError(`加载 ${code} 详情失败: ${err.message}`);
    }
}

/**
 * 渲染综合概率大卡片
 */
function renderDetailProbCard(latest) {
    if (!latest) {
        document.getElementById('detailProbCard').innerHTML = '<div class="prob-big" style="color:var(--text-muted)">--</div><div class="prob-label">暂无数据</div>';
        return;
    }
    
    const si = getSignalInfo(latest.cp);
    
    document.getElementById('detailProbCard').innerHTML = `
        <div class="prob-big" style="color:${si.color}">${latest.cp.toFixed(0)}%</div>
        <div class="prob-label">综合概率 · ${si.label}</div>
        <div class="prob-signal" style="background:${si.color}20;color:${si.color}">
            ${si.icon} ${si.label}
        </div>`;
}

/**
 * 渲染环形进度图 (ECharts gauge)
 */
function renderGaugeChart(latest) {
    // 初始化三个独立的gauge实例
    const doms = {
        vp: document.getElementById('chartGaugeVp'),
        dp: document.getElementById('chartGaugeDp'),
        cp: document.getElementById('chartGaugeCp'),
    };

    if (!doms.vp || !doms.dp || !doms.cp) return;

    if (!gaugeChartVp) {
        gaugeChartVp = echarts.init(doms.vp);
        gaugeChartDp = echarts.init(doms.dp);
        gaugeChartCp = echarts.init(doms.cp);
        window.addEventListener('resize', () => {
            gaugeChartVp && gaugeChartVp.resize();
            gaugeChartDp && gaugeChartDp.resize();
            gaugeChartCp && gaugeChartCp.resize();
        });
    }

    if (!latest) {
        const emptyOption = {
            title: { text: '暂无数据', left: 'center', top: 'center',
                textStyle: { color: '#64748b', fontSize: 13 } }
        };
        gaugeChartVp.setOption(emptyOption);
        gaugeChartDp.setOption(emptyOption);
        gaugeChartCp.setOption(emptyOption);
        return;
    }

    function makeGaugeOption(value, name) {
        return {
            backgroundColor: 'transparent',
            series: [{
                type: 'gauge',
                startAngle: 200,
                endAngle: -20,
                center: ['50%', '55%'],
                radius: '85%',
                min: 0, max: 100,
                splitNumber: 10,
                axisLine: {
                    lineStyle: {
                        width: 14,
                        color: [
                            [0.5, '#22c55e'],
                            [0.7, '#f59e0b'],
                            [1, '#ef4444']
                        ]
                    }
                },
                pointer: {
                    length: '60%',
                    width: 5,
                    itemStyle: { color: '#cbd5e1' }
                },
                axisTick: { distance: -14, length: 6, lineStyle: { width: 1, color: '#64748b' } },
                splitLine: { distance: -18, length: 12, lineStyle: { width: 2, color: '#64748b' } },
                axisLabel: { distance: 24, color: '#64748b', fontSize: 9 },
                detail: {
                    valueAnimation: true,
                    formatter: '{value}%',
                    color: '#e0e6f0',
                    fontSize: 22,
                    fontWeight: 'bold',
                    offsetCenter: [0, '70%']
                },
                title: {
                    offsetCenter: [0, '90%'],
                    fontSize: 12,
                    color: '#8899aa',
                    fontWeight: 600
                },
                data: [{ value: value, name: name }]
            }]
        };
    }

    gaugeChartVp.setOption(makeGaugeOption(latest.vp, '量能概率'), true);
    gaugeChartDp.setOption(makeGaugeOption(latest.dp, '方向概率'), true);
    gaugeChartCp.setOption(makeGaugeOption(latest.cp, '综合概率'), true);
}

/**
 * 渲染趋势折线图
 */
function renderTrendChart(history) {
    const dom = document.getElementById('chartTrend');
    if (!dom) return;
    
    if (!trendChart) {
        trendChart = echarts.init(dom);
        window.addEventListener('resize', () => trendChart && trendChart.resize());
    }
    
    if (!history || history.length === 0) {
        trendChart.setOption({
            title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#64748b', fontSize: 14 } }
        });
        return;
    }
    
    const dates = history.map(h => shortDate(h.d));
    const cpValues = history.map(h => h.cp);
    const vpValues = history.map(h => h.vp);
    const dpValues = history.map(h => h.dp);
    
    // 信号区域标记
    const markAreas = [];
    for (let i = 0; i < cpValues.length; i++) {
        const cp = cpValues[i];
        if (cp >= 70 || (cp >= 50 && cp < 70)) {
            markAreas.push([
                { xAxis: i - 0.4 },
                { xAxis: i + 0.4 }
            ]);
        }
    }

    const option = {
        backgroundColor: 'transparent',
        title: {
            text: '近20天概率趋势',
            left: 'center',
            top: 8,
            textStyle: { color: '#8899aa', fontSize: 13, fontWeight: 600 }
        },
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(20, 27, 38, 0.95)',
            borderColor: 'rgba(56, 189, 248, 0.2)',
            textStyle: { color: '#e0e6f0', fontSize: 12 }
        },
        legend: {
            data: ['综合概率', '量能概率', '方向概率'],
            bottom: 0,
            textStyle: { color: '#8899aa', fontSize: 11 },
            itemWidth: 14, itemHeight: 2
        },
        grid: { top: 40, right: 20, bottom: 30, left: 45 },
        xAxis: {
            type: 'category',
            data: dates,
            axisLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.15)' } },
            axisLabel: { color: '#64748b', fontSize: 10, rotate: 45 },
            boundaryGap: false
        },
        yAxis: {
            type: 'value',
            min: 0, max: 100,
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.06)' } },
            axisLabel: { color: '#64748b', fontSize: 10, formatter: '{value}%' }
        },
        series: [
            {
                name: '综合概率',
                type: 'line',
                data: cpValues,
                smooth: true,
                lineStyle: { color: '#38bdf8', width: 2.5 },
                itemStyle: { color: '#38bdf8' },
                symbol: 'circle',
                symbolSize: 5,
                markLine: {
                    silent: true,
                    data: [
                        { yAxis: 70, label: { formatter: '🔴70%' }, lineStyle: { color: '#ef4444', type: 'dashed', width: 1 } },
                        { yAxis: 50, label: { formatter: '🟡50%' }, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1 } }
                    ],
                    symbol: 'none'
                }
            },
            {
                name: '量能概率',
                type: 'line',
                data: vpValues,
                smooth: true,
                lineStyle: { color: '#818cf8', width: 1.5, type: 'dashed' },
                itemStyle: { color: '#818cf8' },
                symbol: 'diamond',
                symbolSize: 4
            },
            {
                name: '方向概率',
                type: 'line',
                data: dpValues,
                smooth: true,
                lineStyle: { color: '#a78bfa', width: 1.5, type: 'dashed' },
                itemStyle: { color: '#a78bfa' },
                symbol: 'triangle',
                symbolSize: 4
            }
        ]
    };
    trendChart.setOption(option, true);
}

/**
 * 渲染历史数据表格
 */
function renderDetailTable(history) {
    const tbody = document.getElementById('detailTableBody');
    if (!tbody) return;
    
    if (!history || history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted)">暂无数据</td></tr>';
        return;
    }
    
    // 倒序显示（最新在前）
    const rows = [...history].reverse();
    
    tbody.innerHTML = rows.map(h => {
        const si = getSignalInfo(h.cp);
        const rowClass = si.cssClass === 'high' ? 'row-high' : (si.cssClass === 'mid' ? 'row-mid' : '');
        const chgClass = getChgColorClass(h.chg);
        
        return `<tr class="${rowClass}">
            <td>${h.d}</td>
            <td>${h.c.toFixed(3)}</td>
            <td class="${chgClass}">${formatPercent(h.chg)}</td>
            <td>${formatNumber(h.v, 0)}</td>
            <td>${formatNumber(h.vma, 0)}</td>
            <td>${h.vr.toFixed(2)}x</td>
            <td>${h.vp.toFixed(0)}%</td>
            <td>${h.dp.toFixed(0)}%</td>
            <td>${h.sp != null ? h.sp.toFixed(0) + '%' : '--'}</td>
            <td style="font-weight:700;color:${si.color}">${h.cp.toFixed(0)}%</td>
            <td>${createSignalBadge(h.cp)}</td>
        </tr>`;
    }).join('');
}