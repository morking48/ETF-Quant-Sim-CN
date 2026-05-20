"""
策略注册表 — 自动发现并注册所有策略模块
"""
import os
import importlib

_registry = {}


def register(strategy_instance):
    """注册一个策略实例"""
    _registry[strategy_instance.id] = strategy_instance


def get_strategy(strategy_id):
    """获取指定策略"""
    return _registry.get(strategy_id)


def list_strategies():
    """列出所有已注册策略"""
    return [
        {"id": s.id, "name": s.name, "description": s.description}
        for s in _registry.values()
    ]


def discover_strategies():
    """自动发现 strategies/ 下的子目录并加载"""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    for name in os.listdir(base_dir):
        full = os.path.join(base_dir, name)
        if os.path.isdir(full) and not name.startswith('_') and not name.startswith('.'):
            try:
                importlib.import_module(f'strategies.{name}')
            except Exception as e:
                print(f"[策略] 加载 {name} 失败: {e}")


# 启动时自动发现
discover_strategies()