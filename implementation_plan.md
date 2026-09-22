# Taylor Swift 沉浸式电影级展示网站 · 深度打磨与优化方案

本文档制定了针对本项目全部核心需求的技术落地与重构修复方案。

---

## 核心任务与架构原则

本次迭代的核心原则：
1. **不推翻现有 WebGL/OGL 底层架构**：保留 OGL 圆柱几何体与粒子流光系统。
2. **第一优先级解决 React 生命周期与 GSAP Cleanup 缺陷**：确保在 React StrictMode、快速切语言、页面重绘时无重复 canvas、无泄漏、无重复 ScrollTrigger。
3. **彻底攻克 Cylinder → Portal 镜头无缝衔接**：从数学几何层面计算精准正对摄像机的 `rotation.y`，配合预加载、缩放与色调匹配，消除任何切图突兀感。
4. **全面更新 Taylor Swift 官方 Era 数据（12 Eras）**：正式纳入 2025 年 10 月发行的第十二张录音室专辑 *The Life of a Showgirl*，将时代表述更新为更具生命力的表达（“Twelve eras. Two decades of reinvention.”）。
5. **重构 Eras Corridor → Spotlight 叙事逻辑**：采用方案 B，将编年史长廊（2006 Debut 一路走到 2025 Showgirl）的最后一棒自然交接给 Spotlight（聚焦最新 Era: *The Life of a Showgirl*），消除时空倒流的叙事断层。
6. **消除滚动死区与纯黑断层，优化动画节奏与文字时机**：合理压缩滚动里程，确保每一屏滚动均有细腻视觉反馈，文字在场景变换后立即呈现。
7. **移动端深度降级与响应式重构**：引入 `gsap.matchMedia()`，在移动端停用过重的全屏横向 Pin 锁定，转为精致平滑的移动端长廊体验。
8. **统一资产架构并更新 ASSETS.md**：建立统一的 `src/data/assets.ts` 配置中心，映射清晰的目录体系。

---

## Proposed Changes

### 1. 生命周期与资源管理修复 (Priority 1)

#### [MODIFY] [CylinderExperience.tsx](file:///c:/Users/ss/Desktop/taylor-swift-cinematic-journey/src/sections/CylinderExperience.tsx)
- **解耦 `onLoaded` 回调依赖**：使用 `useRef` 保存最新的 `onLoaded` 回调引用，`useEffect` 仅在挂载时运行一次（依赖项设为 `[]`），彻底杜绝父组件因状态更新（如 `isLoading`、`language` 切换）导致 WebGL 与 ScrollTrigger 重复初始化的严重隐患。
- **规范 GSAP Cleanup 机制**：将 `gsap.context()` 实例提升到 `useEffect` 顶级作用域闭包中。在 `useEffect` 返回的 cleanup 函数中严格执行：
  - `ctx.revert()`
  - 遍历并销毁所有该组件所属的 `ScrollTrigger`
  - 移除 `window.resize` 监听器
  - `cancelAnimationFrame(animationFrame)`
  - 彻底释放 OGL 内部资源（geometry, program, texture, renderer.gl.getExtension('WEBGL_lose_context')?.loseContext()）
  - 避免在 Hot Reload 或路由切换时残留第二个 canvas。

#### [MODIFY] [App.tsx](file:///c:/Users/ss/Desktop/taylor-swift-cinematic-journey/src/App.tsx)
- 使用 `useCallback` 稳定 `handleLoaded` 等父级传递的回调函数。
- 确保语言切换不会触发重度 WebGL 组件重渲染。

---

### 2. Cylinder → Portal 镜头数学对齐与真无缝转场 (Priority 2)

#### [MODIFY] [CylinderExperience.tsx](file:///c:/Users/ss/Desktop/taylor-swift-cinematic-journey/src/sections/CylinderExperience.tsx)
- **确立 `PORTAL_IMAGE_INDEX` 统一常量**：设定传送门专用的目标照片序号（例如对应 `reputation` 或 `The Life of a Showgirl`）。
- **计算正对镜头的绝对 Rotation**：
  根据圆柱几何体 UV 展开算法：
  $$u_c = \frac{\text{PORTAL\_IMAGE\_INDEX} + 0.5}{N_{\text{images}}}$$
  $$\theta_c = u_c \cdot 2\pi$$
  相机位于 $(0, 0, Z_{\text{cam}})$ 且朝向 $(0, 0, 0)$，正面朝向相机的点在世界坐标系下具有极角 $\frac{\pi}{2}$。
  圆柱绕 Y 轴旋转 $\phi$ 后的世界位置极角满足 $\theta_c - \phi \equiv \frac{\pi}{2} \pmod{2\pi}$。
  因此使该图片严格居中正对相机的角度为：
  $$\phi_{\text{target}} = \theta_c - \frac{\pi}{2} + 2\pi \cdot k \quad (k \text{ 为平滑旋转圈数})$$
- **分阶段电影级镜头推进（C 模式）**：
  - 0% ~ 70%：常规全景轨道环绕与大角度仰俯角游弋。
  - 70% ~ 88%：减速收拢，精确吸附至目标角度 $\phi_{\text{target}}$。
  - 88% ~ 100%：圆柱停止旋转，相机垂直向该图片中心极速俯冲（Z 轴从 $R + 1.2$ 推进至 $R + 0.08$），其他纹理边缘渐隐，完成向全屏 DOM 画面的像素级对接。

#### [MODIFY] [CylinderPortal.tsx](file:///c:/Users/ss/Desktop/taylor-swift-cinematic-journey/src/sections/CylinderPortal.tsx)
- 接入与 `CylinderExperience` 完全相同的 `PORTAL_IMAGE_INDEX` 素材源。
- 精准匹配初始帧的 `scale`、`brightness` 与透视暗角，并平滑过渡至全屏。

---

### 3. 数据层与时代编年史更新 (12 Eras & Showgirl)

#### [MODIFY] [eras.ts](file:///c:/Users/ss/Desktop/taylor-swift-cinematic-journey/src/data/eras.ts)
- 更新为官方完整的 12 个时代：
  1. `debut` (2006)
  2. `fearless` (2008)
  3. `speak-now` (2010)
  4. `red` (2012)
  5. `1989` (2014)
  6. `reputation` (2017)
  7. `lover` (2019)
  8. `folklore` (2020)
  9. `evermore` (2020)
  10. `midnights` (2022)
  11. `ttpd` (2024)
  12. `showgirl` (2025) —— *The Life of a Showgirl*（新增官方真实信息，复古歌舞剧/活力金橙与薄荷绿视觉，12 首曲目，包括《The Fate of Ophelia》、《Opalite》、《Elizabeth Taylor》等）。

#### [NEW] [assets.ts](file:///c:/Users/ss/Desktop/taylor-swift-cinematic-journey/src/data/assets.ts)
- 建立全站统一资产配置文件：
  ```ts
  export const ASSETS = {
    cylinder: [...],
    portal: { index: 5, src: '...' },
    eras: { ... },
    spotlight: { eraId: 'showgirl', src: '...', video: '...' },
    finale: { src: '...' }
  };
  ```
- 以后更换任意图片素材仅需修改此单个文件。

#### [MODIFY] [i18n.ts](file:///c:/Users/ss/Desktop/taylor-swift-cinematic-journey/src/data/i18n.ts)
- 将所有“11 Eras”更新为耐时间推移的“Twelve Eras. Two decades of reinvention.”（十二个时代篇章，二十载脱胎换骨的音乐重塑）。
- 完善中英文翻译，包括声音切换、无障碍标签、按钮、细节文案。

---

### 4. 叙事逻辑重构：Eras Corridor → Spotlight

#### [MODIFY] [SpotlightEra.tsx](file:///c:/Users/ss/Desktop/taylor-swift-cinematic-journey/src/sections/SpotlightEra.tsx)
- 采纳方案 B：Spotlight 升级为时代史诗的当下载体 —— **The Life of a Showgirl (2025)**。
- 叙事路线：2006 Debut 从过去开始，一路横向行进至 2025 The Life of a Showgirl，然后最后一幅画卷作为当下的巅峰，自然放大为全屏 Spotlight 特写，最后步入 Finale 展望未来。逻辑顺畅，不再发生从 2024 倒退回 2017 的违和感。
- 修复之前“reputation 文案配 Lover 图片”的素材错位 Bug，使用配套的金橙/复古歌舞剧华丽美学。

---

### 5. 节奏优化、黑屏消除与文字出现时机

#### [MODIFY] [CylinderExperience.tsx, ErasCorridor.tsx, SpotlightEra.tsx, FinaleOutro.tsx]
- **精简滚动距离**：
  - Cylinder: 380vh -> 290vh
  - Portal: 130% -> 90%
  - ErasCorridor: 动态计算，每张卡片平均对应合理的步进，杜绝滚动数屏画面无响应的死区。
  - Spotlight: 160% -> 110%
- **文字快速感知**：
  - 场景进入前 15% 即可看清主标题与年份，随后平滑浮现细节与短句，杜绝“场景变了很久文字还没出现”的情况。
  - 为所有文字叠加优雅的高级文字对比阴影（text-shadow / drop-shadow）与局部渐变遮罩，即使面对高亮照片也能清晰阅读。
- **消除黑屏与空白**：
  - 确保各 Pin 区域的离开与下一区域的进入在透明度和变换上紧密咬合，移除多余的空白 padding。

---

### 6. 移动端专门降级 (gsap.matchMedia)

#### [MODIFY] [ErasCorridor.tsx, CylinderExperience.tsx, SpotlightEra.tsx]
- 使用 `gsap.matchMedia()` 分离桌面端与移动端配置：
  - 移动端（`< 768px`）：
    - Cylinder：调整 cameraZ 与 FOV，缩短滚动高度，避免圆柱偏离屏幕造成纯黑。
    - ErasCorridor：将桌面端的强行横向 Pin 改为轻量级自然横向吸附或纵向卡片流，消除移动端失控 Pin 和晃动。
    - 粒子数减半，关闭过重的高斯模糊。

---

### 7. 字体、CSS 与 SEO 完善

#### [MODIFY] [index.css](file:///c:/Users/ss/Desktop/taylor-swift-cinematic-journey/src/index.css)
- 完善中文字体栈：为中文设置独立高质量字体族（`PingFang SC`, `Microsoft YaHei`, `Noto Sans SC`, `system-ui`），避免 Latin 字体 `Cinzel` 导致中文 fallback 变形。
- 增加 `prefers-reduced-motion` 媒体查询支持。

#### [MODIFY] [index.html](file:///c:/Users/ss/Desktop/taylor-swift-cinematic-journey/index.html)
- 优化 SEO 标题、OG Meta 标签与 Twitter 卡片，彻底清除任何陈旧残留。

#### [MODIFY] [ASSETS.md](file:///c:/Users/ss/Desktop/taylor-swift-cinematic-journey/ASSETS.md)
- 真实对齐 `public/assets/` 结构与 12 Eras 规范，提供详尽的替换指南。

---

## Verification Plan

### Automated Tests & Quality Assurance
1. **TypeScript 编译与打包测试**：
   - 运行 `pnpm build`，确保 0 警告 0 错误。
2. **完整自动化浏览器操作（Chrome & Edge CDP）**：
   - 运行自动化脚本 `test_browser.mjs`：
     - 测试 1920×1080 桌面端完整滚到底并截图检查所有场景。
     - 测试 1366×768 笔记本分辨率。
     - 测试 390×844 移动端设备。
     - 测试 中英文双向切换（验证 DOM lang、文本、无重复 ScrollTrigger、无多余 Canvas）。
     - 验证 Console 中 0 Exception、0 Warning。
3. **视觉细节复核**：
   - 重点检查 Cylinder Dive 最后一帧是否与 Portal 第一帧精确重合。
   - 检查卡片滚动是否每一小段均有视觉进展，无黑屏，无死区。
