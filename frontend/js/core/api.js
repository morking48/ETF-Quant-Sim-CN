/**
 * API 调用层
 * 调用 Flask 后端接口
 */
const API_BASE = 'http://localhost:5000/api';

/**
 * 通用 fetch 封装，含超时和错误处理
 */
async function apiFetch(path, timeout = 30000) {
    const url = API_BASE + path;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    
    try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${resp.status}`);
        }
        return await resp.json();
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
            throw new Error('请求超时');
        }
        throw err;
    }
}

/**
 * 健康检查
 */
async function apiHealth() {
    return apiFetch('/health');
}

/**
 * 获取ETF列表
 */
async function apiGetETFList() {
    return apiFetch('/etfs');
}

/**
 * 获取完整三因子分析
 */
async function apiGetAnalysis() {
    return apiFetch('/analysis');
}

/**
 * 获取单只ETF分析
 */
async function apiGetSingleAnalysis(code) {
    return apiFetch(`/analysis/${code}`);
}

/**
 * 获取K线数据
 */
async function apiGetKline(code, limit = 60) {
    return apiFetch(`/kline/${code}?limit=${limit}`);
}

/**
 * 获取沪深300指数K线
 */
async function apiGetIndexKline(limit = 60) {
    return apiFetch(`/index_kline?limit=${limit}`);
}