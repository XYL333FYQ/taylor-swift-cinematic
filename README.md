# Taylor Swift — The Cinematic Eras Journey

一个非官方、非商业的 Taylor Swift 粉丝向沉浸式数字展览网站。它把专辑时代、影像素材、滚动叙事和电影化动效组合成一段可以在浏览器中慢慢走完的视觉旅程。

> This is an unofficial, non-commercial fan-made project. It is not affiliated with, endorsed by, or sponsored by Taylor Swift or her representatives.

## 项目简介

这个项目不是一个普通的专辑列表，而是一条连续的互动叙事：从黑暗中的序幕开始，经过 3D 圆柱回廊、无缝传送门和横向时代长廊，最后在焦点时代与尾声页面结束。

页面默认使用英文，也支持中文切换。语言偏好会保存在浏览器的 localStorage 中；声音默认关闭，用户可以主动开启由 Web Audio API 实时合成的环境氛围声。

## 体验结构

- **Act I · Hero Intro**：电影式黑场开场、首屏肖像和向下探索提示。
- **Act II · Cylinder Experience**：基于 OGL/WebGL 的 3D 圆柱视觉回廊，随滚动推进镜头、粒子和时代图像。
- **Act III · Cylinder Portal**：镜头穿透核心照片，完成从 3D 场景到全屏内容的连续转场。
- **Act IV · Eras Corridor**：由 GSAP ScrollTrigger 驱动的横向时代长廊，包含从首张同名专辑到 2025 年《The Life of a Showgirl》的 12 个时代卡片。
- **Act V · Spotlight**：以《The Life of a Showgirl》为焦点的舞台化特写章节。
- **Act VI · Era Index & Finale**：时代索引、演出全景和可重新开始的尾声。

## 主要特性

- React 19 + TypeScript + Vite 的模块化前端结构
- OGL/WebGL 3D 圆柱、粒子流光和着色器效果
- GSAP + ScrollTrigger 驱动的滚动叙事和镜头运动
- 英文 / 中文双语切换，并自动同步页面语言与标题
- 原生 Web Audio API 环境声，不依赖外部音频文件
- 响应式排版、懒加载图片、加载动画和胶片颗粒层
- 适合部署到 Vercel、Netlify、Cloudflare Pages 等静态托管平台

## 技术栈

| 类别 | 技术 |
| --- | --- |
| UI | React 19, TypeScript |
| 构建 | Vite 7, pnpm |
| 动效 | GSAP, ScrollTrigger |
| 3D | OGL, WebGL |
| 样式 | Tailwind CSS 4, 自定义 CSS |
| 声音 | Web Audio API |

## 项目结构

~~~text
src/
├── components/       # 导航、加载动画、胶片颗粒层
├── sections/         # Hero、3D 圆柱、传送门、时代长廊、焦点和尾声
├── data/             # 12 个时代的数据与双语文案
├── lib/audio/        # Web Audio 环境声合成器
├── lib/ogl/          # 圆柱几何体、纹理和着色器工具
├── App.tsx           # 页面主编排
└── main.tsx          # React 入口

public/
├── img/taylor/       # 当前页面使用的时代与舞台图片
├── taylor-*.{png,ico,svg}  # 网站图标
└── vercel.json       # Vercel 静态路由配置
~~~

## 本地运行

需要安装 Node.js 和 pnpm。然后在项目根目录执行：

~~~bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 生产构建
pnpm build

# 代码规范检查
pnpm lint

# 预览生产构建
pnpm preview
~~~

生产构建输出到 dist/，可以直接交给支持静态站点的托管平台。部署时请使用仓库中的 pnpm-lock.yaml，以保证依赖版本一致。

## 素材与版权说明

- 当前页面使用的图片来源地址记录在 [public/img/taylor/sources.json](./public/img/taylor/sources.json) 中；下载和 WebP 编码说明见 [ASSETS.md](./ASSETS.md)。
- 图片、Taylor Swift 的姓名与形象、专辑名称、商标以及歌词/引用内容均归各自权利人所有。本仓库不代表获得了这些素材的商业使用授权。
- 本项目仅用于个人学习、前端实验和非商业粉丝展示。未经权利人许可，请不要将图片、品牌元素或页面内容用于商业项目。
- 仓库中的页面代码、视觉实现和音频合成逻辑属于本项目的原创部分；除非另有明确说明，公开仓库不等于授予第三方复制或再发布全部素材的许可。

## 开发说明

素材替换、图片尺寸建议和资源来源维护方式集中写在 [ASSETS.md](./ASSETS.md)。如果要替换时代图片，尽量保持文件名和路径不变，这样无需修改组件和时代数据。

提交前建议运行：

~~~bash
pnpm lint
pnpm build
~~~

## English

**Taylor Swift — The Cinematic Eras Journey** is an unofficial, non-commercial fan-made digital exhibition built as a cinematic scrolling experience. It combines a WebGL cylinder, GSAP-driven camera transitions, a horizontal eras archive, bilingual copy, and a browser-generated ambient sound layer.

The journey currently covers 12 eras, from Taylor Swift (2006) through *The Life of a Showgirl* (2025). The site is built with React, TypeScript, Vite, GSAP, OGL, Tailwind CSS, and the Web Audio API.

Run it locally with:

~~~bash
pnpm install
pnpm dev
~~~

For production, run pnpm build; the static output is written to dist/.

All artist names, imagery, album titles, trademarks, and quoted lyrics belong to their respective rights holders. See [ASSETS.md](./ASSETS.md) and [public/img/taylor/sources.json](./public/img/taylor/sources.json) for source references and asset notes.
