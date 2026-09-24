import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 出错时展示的内容。默认什么都不渲染，让这一屏直接消失而不是拖垮整页。 */
  fallback?: ReactNode;
  /** 用于日志里区分是哪个章节挂掉的。 */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * 章节级错误边界。
 *
 * 3D 圆柱、横向长廊这类重章节都依赖 WebGL / GSAP，在异常环境里一旦抛错，
 * 没有边界的话 React 会卸载整棵树 —— 访客看到的就是一张白页。
 * 包上边界之后，坏掉的那一屏自己消失，其余内容照常可读。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label ?? 'section'}] 渲染失败：`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
