# 🏗️ ETF量化系统 — 多策略架构改造规划

> **版本**: etf-web（桌面Web版）  
> **目标**: 将当前硬编码的三因子单一策略，改造为可插拔多策略引擎  
> **约束**: 不破坏现有功能，三因子作为默认策略保留  
> **后续**: etf-app（PWA移动版）下一轮参照本方案调整  

---

## 目录

1. [现状分析](#1-现状分析)
2. [通用不变层 vs 需改造层](#2-通用不变层-vs-需改造层)
3. [目标架构](#3-目标架构)
4. [策略接口规范](#4-策略接口规范)
5. [分阶段改造计划](#5-分阶段改造计划)
6. [新增策略：ETF网格交易](#6-新增策略etf网格交易)
7. [工作量评估](#7-工作量评估)

---

## 1. 现状分析

### 1.1 代码结构

```
etf-web/
├── backend/
│   ├── server.py          ← 949行，单文件Flask后端（核心）
│   ├── requirements.txt
│   └── userdata/           ← 模拟盘云端同步目录
│       └── sim_data.json
├── frontend/
│   ├── index.html          ← 222行，桌面端入口
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js           ← Tab路由 + 自动刷新 + 全局状态
│       ├── core/
│       │   ├── api.js       ← 数据获取 + doRefresh()
│       │   ├── engine.js    ← 🔴 三因子计算引擎（强耦合）
│       │   └── simulator.js ← 🔴 模拟交易引擎（硬编码三因子信号）
│       ├── ui/
│       │   ├── components.js
│       │   ├── dashboard.js ← 仪表盘
│       │   ├── detail.js    ← ETF详情（三因子环形图+折线）
│       │   ├── history.js   ← 历史热力图
│       │   ├── report.js    ← 综合报告（国家队语义）
│       │   └── sim_ui.js    ← 模拟盘UI + 配置面板
│       └── utils/
│           ├── date.js      ✅ 日期工具（通用）
│           ├── format.js    ✅ 格式化工具（通用）
│           └── statistics.js✅ 统计指标（通用）
├── start.bat
├── README.md
└── 操作指南.md
```

### 1.2 后端 server.py 耦合分析（949行）

```
数据获取层 (60行)
├── fetch_kline(code, limit)       ✅ 通用：K线获取（腾讯财经API）
│
三因子引擎 (120行) 🔴 强耦合
├── vprob(r)                       🔴 量能概率（分段线性映射）
├── dprob(chg, t5_etf, t5_idx...)  🔴 方向概率（4维度加权）
├── sprob(share_delta_pct)         🔴 份额概率
├── analyze_single(...)            🔴 三因子综合计算+信号分级
├── align_idx(...)                 🔴 ETF日期对齐沪深300
│
份额数据层 (150行) 🔴 强耦合
├── fetch_share_history(...)       🔴 akshare上交所/深交所份额
├── get_share_data_with_cache(...) 🔴 份额磁盘缓存 + 懒加载
│
API路由 (350行)
├── /api/analysis                  🔴 返回结构绑定三因子
│   ├── 汇总: high/mid/normal/hs300_alert
│   ├── 报告: rating(国家队语义)/volume_ranking/direction/signal_backtrack
│   └── etfs: [{code, name, history[{vp,dp,sp,cp,signal}], latest}]
├── /api/analysis/<code>           🔴 同上，单ETF版
├── /api/backtest                  🔴 硬编码三因子信号波段回测
│   ├── 买入: cp>=70 高确信
│   ├── 卖出: 硬止损-5% / 信号消退cp<40 / 时间止损10天
│   └── 仓位: 单次position_ratio, 总仓<80%
├── /api/health                    ✅ 通用
├── /api/etfs                      ✅ 通用
├── /api/kline/<code>              ✅ 通用
├── /api/index_kline               ✅ 通用
├── /api/sim/save                  ✅ 通用
├── /api/sim/load                  ✅ 通用
│
静态文件 (30行)
├── /                              前端入口
└── /app/                          PWA入口
```

### 1.3 前端 simulator.js 耦合分析（431行）

```javascript
// DEFAULT_SIM_CONFIG 第18行 — 已预留策略枚举，但从未使用！
strategy: 'signal_band',  // signal_band | ma_filter | position_rotate | grid_invest

// checkBuySignals()  — 硬编码三因子
// 只看 cp>=70 高确信、多ETF共振、沪深300交叉验证

// checkSellSignals() — 硬编码三因子
// 止损-5%、信号卖出cp<40、时间止损10天
```

---

## 2. 通用不变层 vs 需改造层

### ✅ 通用层（零改动）

| 层级 | 文件 | 内容 | 理由 |
|------|------|------|------|
| 后端-数据 | `server.py` → `fetch_kline()` | K线获取 | 所有策略的燃料 |
| 后端-路由 | `/api/health` `/api/etfs` `/api/kline/<code>` `/api/index_kline` `/api/sim/*` | 基础API | 策略无关 |
| 前端-工具 | `js/utils/date.js` | 交易日/格式化 | 纯工具 |
| 前端-工具 | `js/utils/format.js` | 金额/百分比 | 纯展示 |
| 前端-统计 | `js/utils/statistics.js` | 胜率/回撤/夏普/累计收益 | 任何策略回测通用 |
| 前端-入口 | `js/app.js` | Tab路由+自动刷新 | 框架层 |
| 前端-样式 | `css/style.css` | 主题/布局 | 框架层 |
| 前端-UI | `js/ui/components.js` | 通用组件 | 组件库 |
| 模拟器 | `simulator.js` → `settleHoldings()` `executeTrade()` `initSimulator()` | 持仓结算/执行交易/初始化/存储 | 交易执行通用 |

### 🔴 需改造层（详细清单）

| 优先级 | 文件 | 当前耦合 | 改造方向 |
|:------:|------|----------|----------|
| P0 | **新建** `backend/strategies/` | — | 策略目录 |
| P0 | **新建** `backend/strategies/__init__.py` | — | 策略注册发现 |
| P0 | **新建** `backend/strategies/base.py` | — | 策略接口基类 |
| P1 | **新建** `backend/strategies/three_factor/` | — | 重构现有代码 |
| P1 | **移动** `server.py:vprob/dprob/sprob` → `three_factor/factors.py` | 三因子专属 | 抽为策略模块（不改逻辑） |
| P1 | **移动** `server.py:analyze_single/align_idx` → `three_factor/engine.py` | 三因子综合计算 | 抽为策略模块 |
| P1 | **重构** `server.py:/api/analysis` → 委托策略 | 返回结构绑定三因子 | 新增通用端点 + 策略端点 |
| P1 | **重构** `server.py:/api/backtest` → 参数化 | 硬编码信号波段 | 策略参数注入 |
| P2 | **拆分** `server.py:/api/analysis` → `/api/data/raw` | 返回原始K线+份额 | 新增策略无关数据端点 |
| P2 | **重构** `frontend/js/core/engine.js` | 三因子专属函数 | 抽到 `js/strategies/three_factor/` |
| P2 | **重构** `frontend/js/core/simulator.js` | checkBuySignals / checkSellSignals | 委托给策略trader |
| P2 | **重构** `frontend/js/ui/sim_ui.js` | 配置面板字段固定 | 根据策略动态渲染 |
| P2 | **新增** `frontend/js/strategies/` | — | 前端策略目录 |
| P2 | **新增** `frontend/js/ui/strategy_selector.js` | — | 策略选择器组件 |
| P3 | `frontend/js/ui/report.js` | 国家队语义绑定 | 策略适配报告 |
| P3 | `frontend/js/ui/dashboard.js` | 信号灯绑定cp值 | 策略适配卡 |
| P3 | `frontend/index.html` | — | 策略选择器 + 策略Tab |

---

## 3. 目标架构

```
etf-web/
├── backend/
│   ├── server.py                    # 🔧 精简：只保留路由+静态文件
│   ├── strategies/                  # 🆕 策略目录
│   │   ├── __init__.py              #    策略注册表
│   │   ├── base.py                  #    策略基类（接口定义）
│   │   ├── three_factor/            #    三因子策略（从server.py拆出）
│   │   │   ├── __init__.py
│   │   │   ├── config.py            #    默认参数
│   │   │   ├── factors.py           #    vprob/dprob/sprob
│   │   │   ├── engine.py            #    analyze_single/align_idx
│   │   │   └── backtest.py          #    信号波段回测逻辑
│   │   └── grid/                    # 🆕 ETF网格策略
│   │       ├── __init__.py
│   │       ├── config.py            #    默认参数
│   │       ├── engine.py            #    网格计算引擎
│   │       └── backtest.py          #    网格回测引擎
│   ├── data/                        # 🆕 数据层（从server.py抽）
│   │   ├── __init__.py
│   │   ├── kline.py                 #    fetch_kline
│   │   └── shares.py               #    fetch_share_history（份额缓存）
│   └── userdata/
│
├── frontend/
│   ├── index.html                   # 🔧 +策略选择器
│   └── js/
│       ├── strategies/              # 🆕 前端策略目录
│       │   ├── registry.js          #    策略注册表
│       │   ├── base.js              #    策略接口（JS版）
│       │   ├── three_factor/        #    三因子（从engine.js拆出）
│       │   │   ├── index.js
│       │   │   ├── factors.js       #    calcVolumeProb/DirProb/ShareProb
│       │   │   ├── signals.js       #    calcComposite/getSignalLevel
│       │   │   ├── backtest.js      #    doLocalBacktest
│       │   │   ├── trader.js        #    checkBuySignals/SellSignals
│       │   │   └── config.js        #    默认参数
│       │   └── grid/                # 🆕 网格策略
│       │       ├── index.js
│       │       ├── factors.js       #    波动率/价格区间计算
│       │       ├── backtest.js      #    网格回测
│       │       ├── trader.js        #    触发规则（触及→成交）
│       │       └── config.js        #    间距/层数/资金
│       ├── core/
│       │   ├── api.js               # 🔧 doRefresh() → 调策略端点
│       │   ├── engine.js            # 🔧 策略调度器（非三因子专属）
│       │   ├── simulator.js         # 🔧 调用 strategy.trader 接口
│       │   └── data_adapter.js      # 🆕 数据转换层
│       ├── ui/
│       │   ├── strategy_selector.js # 🆕 策略选择器组件
│       │   ├── sim_ui.js            # 🔧 配置面板策略驱动
│       │   └── ...（其他UI）        # 🔧 策略语义适配
│       └── utils/                   # ✅ 不变
```

---

## 4. 策略接口规范

### 4.1 后端 Python 策略类

```python
# backend/strategies/base.py

class BaseStrategy:
    """策略基类 — 所有策略必须实现此接口"""
    
    # --- 元信息 ---
    id: str              # 唯一标识，如 'three_factor'
    name: str            # 显示名称，如 '三因子ETF监测'
    description: str     # 策略描述
    
    # --- 配置 ---
    DEFAULT_CONFIG: dict # 默认参数
    
    # --- 因子计算 ---
    def compute_factors(self, kline_data, idx_data=None, **kwargs) -> dict:
        """原始K线 → 策略因子"""
        ...
    
    # --- 信号生成 ---
    def generate_signals(self, factors: dict, config: dict) -> list:
        """因子 → 交易信号列表"""
        ...
    
    # --- 回测 ---
    def run_backtest(self, etf_codes, date_range, config, share_data=None) -> dict:
        """历史回测 → {trades, metrics, equity_curve}"""
        ...
    
    # --- 交易规则 ---
    def get_buy_conditions(self, signals, positions, cash, config) -> list:
        """当前信号 → 买入建议列表 [{code, reason, priority, size}]"""
        ...
    
    def get_sell_conditions(self, positions, signals, config) -> list:
        """当前持仓 → 卖出建议列表 [{code, reason, priority}]"""
        ...
```

### 4.2 前端 JavaScript 策略类

```javascript
// frontend/js/strategies/base.js

class BaseStrategy {
    // 元信息
    static id = '';
    static name = '';
    static description = '';
    
    // 默认配置
    static DEFAULT_CONFIG = {};
    
    // 因子计算
    computeFactors(rawData) { return {}; }
    
    // 信号生成
    generateSignals(factors, config) { return []; }
    
    // 回测
    runBacktest(data, config) { return {}; }
    
    // 交易规则
    getBuySignals(signals, positions, cash, config) { return []; }
    getSellSignals(positions, signals, config) { return []; }
}
```

### 4.3 统一数据格式（策略无关）

```python
# 后端新增 /api/data/raw 端点
{
    "target_date": "2026-05-18",
    "etfs": {
        "510300": {
            "name": "华泰柏瑞沪深300ETF",
            "kline": [
                {"date": "2026-01-01", "o": 3.5, "c": 3.52, "h": 3.55, "l": 3.48, "v": 123456789}
            ],
            "shares": [
                {"date": "2026-05-18", "shares_yi": 3250.5, "delta_pct": 0.35}
            ]
        }
    },
    "index_kline": {  # 沪深300基准
        "code": "000300",
        "name": "沪深300",
        "kline": [...]
    }
}
```

---

## 5. 分阶段改造计划

### Phase 1: 后端策略框架搭建（2天）

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1.1 | **新建** `backend/strategies/__init__.py` | 创建 | 策略注册表 + 自动发现 |
| 1.2 | **新建** `backend/strategies/base.py` | 创建 | 策略基类（含接口定义） |
| 1.3 | **新建** `backend/strategies/three_factor/` | 创建目录 | — |
| 1.4 | **新建** `backend/strategies/three_factor/__init__.py` | 创建 | 导出 Strategy 实例 |
| 1.5 | **新建** `backend/strategies/three_factor/config.py` | 创建 | 默认参数 |
| 1.6 | **新建** `backend/strategies/three_factor/factors.py` | 移动代码 | 从 server.py 移入 vprob/dprob/sprob（不改逻辑） |
| 1.7 | **新建** `backend/strategies/three_factor/engine.py` | 移动代码 | 从 server.py 移入 analyze_single/align_idx |
| 1.8 | **新建** `backend/strategies/three_factor/backtest.py` | 移动代码 | 从 server.py 移入 /api/backtest 交易逻辑（抽为纯函数） |
| 1.9 | **改造** `backend/server.py` | 修改 | `/api/analysis` 改为调用 ThreeFactorStrategy.compute_and_analyze() |
| 1.10 | **改造** `backend/server.py` | 修改 | `/api/backtest` 改为调用 ThreeFactorStrategy.run_backtest() |

**✅ 检查点**：启动 server.py，调用 `/api/analysis` — 行为与改造前完全一致，数据格式不变。

### Phase 2: 后端通用数据端点 + 网格策略（1.5天）

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 2.1 | **新建** `backend/data/` | 创建目录 | 数据层 |
| 2.2 | **新建** `backend/data/kline.py` | 创建 | 从 server.py 移入 fetch_kline |
| 2.3 | **新建** `backend/data/shares.py` | 创建 | 从 server.py 移入 fetch_share_history + 缓存 |
| 2.4 | **新增** `backend/server.py` | 新增路由 | `/api/data/raw` — 返回策略无关原始数据 |
| 2.5 | **新增** `backend/server.py` | 新增路由 | `/api/strategies` — 返回可用策略列表 |
| 2.6 | **新增** `backend/server.py` | 新增路由 | `/api/strategy/<id>/analyze` — 按策略分析 |
| 2.7 | **新增** `backend/server.py` | 新增路由 | `/api/strategy/<id>/backtest` — 按策略回测 |
| 2.8 | **新建** `backend/strategies/grid/` | 创建目录 | — |
| 2.9 | **新建** `backend/strategies/grid/config.py` | 创建 | 网格默认参数 |
| 2.10 | **新建** `backend/strategies/grid/engine.py` | 创建 | 网格计算（区间/层数/触发价） |
| 2.11 | **新建** `backend/strategies/grid/backtest.py` | 创建 | 网格回测引擎 |

**✅ 检查点**：
- `GET /api/strategies` → 返回 `[{id, name, description}]`
- `POST /api/strategy/grid/backtest` → 返回回测报告
- 老端点 `/api/analysis` 仍然可用（内部委托给 three_factor 策略）

### Phase 3: 前端策略框架（2天）

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 3.1 | **新建** `frontend/js/strategies/` | 创建目录 | — |
| 3.2 | **新建** `frontend/js/strategies/base.js` | 创建 | 策略基类（JS版接口） |
| 3.3 | **新建** `frontend/js/strategies/registry.js` | 创建 | 策略注册表 |
| 3.4 | **新建** `frontend/js/strategies/three_factor/` | 创建目录 | 从 engine.js 拆出 |
| 3.5 | **移动** `frontend/js/core/engine.js` → `strategies/three_factor/factors.js` | 移动 | calcVolumeProb/DirProb/ShareProb |
| 3.6 | **新建** `frontend/js/strategies/three_factor/signals.js` | 创建 | calcComposite/getSignalLevel |
| 3.7 | **新建** `frontend/js/strategies/three_factor/backtest.js` | 移动 | doLocalBacktest |
| 3.8 | **新建** `frontend/js/strategies/three_factor/trader.js` | 移动 | checkBuySignals/SellSignals (从simulator.js) |
| 3.9 | **新建** `frontend/js/strategies/three_factor/config.js` | 创建 | 默认参数 (从simulator.js DEFAULT_SIM_CONFIG) |
| 3.10 | **新建** `frontend/js/strategies/three_factor/index.js` | 创建 | 策略入口（实现BaseStrategy） |
| 3.11 | **改造** `frontend/js/core/engine.js` | 修改 | 改为策略调度器（调activeStrategy） |
| 3.12 | **改造** `frontend/js/core/simulator.js` | 修改 | checkBuySignals/SellSignals → 委托策略 |
| 3.13 | **新增** `frontend/js/core/data_adapter.js` | 创建 | 原始数据 → 策略输入格式转换 |

**✅ 检查点**：前端切换策略下拉框 → 默认三因子 → 仪表盘/详情/报告与原版一致。

### Phase 4: 前端网格策略 + 策略选择UI（1.5天）

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 4.1 | **新建** `frontend/js/strategies/grid/` | 创建目录 | — |
| 4.2 | **新建** `frontend/js/strategies/grid/config.js` | 创建 | 网格参数（区间、间距、层数） |
| 4.3 | **新建** `frontend/js/strategies/grid/factors.js` | 创建 | 波动率、价格区间计算 |
| 4.4 | **新建** `frontend/js/strategies/grid/backtest.js` | 创建 | 网格回测引擎 |
| 4.5 | **新建** `frontend/js/strategies/grid/trader.js` | 创建 | 网格触发规则 |
| 4.6 | **新建** `frontend/js/strategies/grid/index.js` | 创建 | 策略入口 |
| 4.7 | **新建** `frontend/js/ui/strategy_selector.js` | 创建 | 策略下拉框 + 切换逻辑 |
| 4.8 | **改造** `frontend/js/ui/sim_ui.js` | 修改 | 配置面板根据 activeStrategy 动态渲染字段 |
| 4.9 | **改造** `frontend/index.html` | 修改 | 导航栏加策略选择器 `<select>` |

**✅ 检查点**：选择「ETF网格交易」→ 模拟盘配置面板显示网格专属参数（间距/层数等）→ 回测返回网格策略结果。

### Phase 5: UI适配 + 测试（1天）

| # | 内容 |
|---|------|
| 5.1 | 仪表盘：ETF卡片信号展示适配策略语义 |
| 5.2 | 详情Tab：图表标题/字段适配策略 |
| 5.3 | 报告Tab：评级文字适配策略（不再固定"国家队"语义） |
| 5.4 | 功能测试：三因子 ↔ 网格切换，数据不串 |
| 5.5 | 回测对比：同一区间三因子 vs 网格回测，确认数据独立 |
| 5.6 | 边界测试：切换策略时持仓状态处理 |

---

## 6. 新增策略：ETF网格交易

### 6.1 策略核心逻辑

```
输入: ETF代码 + 历史K线
输出: 网格表 + 交易信号

计算步骤:
1. 根据历史价格计算合理区间 [low, high]
   - 默认取近60日最低价/最高价的 95%~105%
   - 用户可手动调整
2. 网格间距 = 区间宽度 × (用户设定百分比，默认1.5%)
3. 网格层数 = (high - low) / 间距
4. 每格资金 = 总资金 / 层数（或按配置比例）
5. 初始建仓: 当前价所在层以下全买
6. 运行中: 价格触及网格线 → 触发买卖
   - 突破上沿 → 卖出一格
   - 跌破下沿 → 买入一格
```

### 6.2 配置参数

```javascript
DEFAULT_GRID_CONFIG = {
    initial_capital: 300000,    // 总资金（元）
    grid_range_mode: 'auto',    // auto | manual
    grid_low: null,             // 手动下沿（manual模式）
    grid_high: null,            // 手动上沿（manual模式）
    grid_range_pct: 10,         // 自动区间：±10%
    grid_spacing_pct: 1.5,      // 网格间距（%）
    grid_spacing_mode: 'pct',   // pct | fixed（固定金额）
    grid_fixed_spacing: 0.05,   // 固定间距（元）
    base_position_pct: 50,      // 底仓比例（%），初始建仓
    reserve_pct: 10,            // 预留现金（%），不下网格
    fee_rate: 0.00025,          // 手续费率 万2.5
};
```

### 6.3 回测输出

```json
{
    "strategy": "grid",
    "params": { "grid_low": 3.2, "grid_high": 4.0, "layers": 16, ... },
    "start_date": "2025-01-01",
    "end_date": "2026-05-18",
    "initial_capital": 300000,
    "final_value": 335000,
    "total_return": 11.67,
    "annual_return": 8.2,
    "total_trades": 87,
    "buy_count": 44,
    "sell_count": 43,
    "win_rate": 68.5,
    "max_drawdown": 6.8,
    "sharpe": 1.42,
    "grid_performance": {
        "grid_income": 12000,
        "base_income": 23000,
        "avg_grid_monthly": 700
    },
    "trades": [...],
    "equity_curve": [...]
}
```

### 6.4 交易建议格式

```javascript
// 策略trader.getBuySignals() 返回
[
    {
        code: "510300",
        name: "华泰柏瑞沪深300ETF",
        action: "BUY",
        reason: "触及网格下沿 3.45 (第8层)",
        priority: 1,
        size: 15000,  // 建议买入金额
        grid_level: 8,
        trigger_price: 3.45
    }
]
```

---

## 7. 工作量评估

| Phase | 内容 | 工时 | 新文件 | 改造文件 | 关键产出 |
|-------|------|:----:|:------:|:------:|----------|
| **Phase 1** | 后端策略框架搭建 | 2天 | 8个 | 2个 | 三因子策略模块化，API行为不变 |
| **Phase 2** | 后端通用端点+网格 | 1.5天 | 8个 | 1个 | `/api/strategies` `/api/data/raw` 网格回测 |
| **Phase 3** | 前端策略框架 | 2天 | 9个 | 2个 | 策略注册表 + 三因子前端模块 |
| **Phase 4** | 前端网格+策略选择 | 1.5天 | 6个 | 2个 | 策略切换下拉框 + 网格策略完整上线 |
| **Phase 5** | UI适配+测试 | 1天 | — | 3个 | 两策略完整切换可用 |
| **合计** | | **8天** | **31个** | **10个** | — |

---

## 附录A: etf-web vs etf-app 差异速查

| 维度 | etf-web | etf-app |
|------|---------|---------|
| 定位 | 桌面Web（本地运行） | PWA移动版（Vercel部署） |
| 后端 | `backend/server.py` (949行) | `api/index.py` (604行) |
| 依赖 | 引 `etf-three-factor-v7/scripts` | 独立自包含 |
| 前端 | `frontend/`（12 JS） | `etf-app/`（13 JS + PWA） |
| PWA | 无 | sw.js + manifest.json |
| CSS | 单文件 style.css | style.css + mobile.css |
| 份额缓存 | 磁盘JSON文件 | 无（仅内存） |
| 静态服务 | Flask send_from_directory | 同 |
| 模拟盘同步 | `/api/sim/save|load` → 磁盘 | localStorage |
| K线获取 | 同（腾讯财经） | 同 |
| 份额获取 | 同（akshare） | 同 |
| 三因子引擎 | 后端计算 | 前后端各一份 |
| 回测 | 后端 | 前后端各一份 |

---

## 附录B: 改造后的API端点一览

| 端点 | 方法 | 说明 | 改造类型 |
|------|:----:|------|:--------:|
| `/api/health` | GET | 健康检查 | ✅ 不变 |
| `/api/etfs` | GET | ETF列表 | ✅ 不变 |
| `/api/kline/<code>` | GET | 单ETF K线 | ✅ 不变 |
| `/api/index_kline` | GET | 沪深300 K线 | ✅ 不变 |
| `/api/sim/save` | POST | 模拟盘保存 | ✅ 不变 |
| `/api/sim/load` | GET | 模拟盘加载 | ✅ 不变 |
| `/api/strategies` | GET | 策略列表 | 🆕 新增 |
| `/api/data/raw` | GET | 原始数据 | 🆕 新增 |
| `/api/analysis` | GET | 三因子分析（兼容） | 🔧 委托策略 |
| `/api/analysis/<code>` | GET | 单ETF分析（兼容） | 🔧 委托策略 |
| `/api/backtest` | POST | 回测（兼容） | 🔧 策略参数化 |
| `/api/strategy/<id>/analyze` | GET | 按策略分析 | 🆕 新增 |
| `/api/strategy/<id>/backtest` | POST | 按策略回测 | 🆕 新增 |

---

> 📅 创建日期: 2026-05-18  
> 📋 关联文档: `etf-web/操作指南.md` `etf-three-factor-v7/SKILL.md` `etf-app/DEPLOY.md`  
> 🔜 下一步: 确认方案后切换到ACT MODE，从Phase 1开始实施