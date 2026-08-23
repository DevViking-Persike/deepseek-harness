# Agent Note：侧边栏可移动到框架的任意一侧

Status: implemented

[English](2026-08-22-movable-sidebar-side.md) | 中文

## Problem

`AppFrame` 把侧边栏硬编码为第一条网格轨道，详情面板为第三条。有人把浏览器放在半屏工作，也有人只是希望导航栏靠近惯用手一侧，但都无法移动它；唯一的退路是把该列收起为 56px 导轨，从而彻底失去浏览器。

三列求解器本身并不要求这个顺序。让步链、宽度钳制和拖拽把手都作用于轨道宽度，而非绝对屏幕位置。

## Decision

位置成为瞬时布局 store 的又一个字段：`sidebarSide: 'left' | 'right'`，由 `toggleSidebarSide()` 翻转，并通过 `ctx.layout` 暴露给跨插件调用方。`AppFrame` 读取它并同时镜像三件事——网格模板顺序、`.sidebarCol` 与 `.detailsCol` 的网格列与边框（通过框架上的 `data-sidebar-side` 属性），以及每个拖拽增量的符号，使把手在向视口外侧拖动时仍然加宽自己的面板。宽度、让步链和收起行为保持不变：改变的只是两条外侧轨道的顺序。

执行翻转的控件位于 `ui-sidebar` 而非 `ui-layout`，注册进 `ui-sidebar` 自己声明的 `sidebar.footer.action` 列表 slot。依赖方向由此成立：`ui-sidebar` 本就注入 `ctx.layout`；若把按钮放进 `ui-layout`，则需要一条 `ui-layout → ui-sidebar` 的包引用，与既有的 `ui-sidebar → ui-layout` 构成 TypeScript 拒绝的项目引用环。控件随它移动的那一列一起发布，状态则留在拥有几何的框架里。

位置与宽度一样是瞬时状态——store 从不触碰 `localStorage`，因此重新加载会恢复默认的左侧位置。

## Alternatives considered

**纯 CSS 镜像（`direction: rtl` 或 `order`）。** 无需 store 字段即可翻转轨道，但拖拽计算基于 client X 与实测轨道宽度；把它们留在视觉顺序里会反转每一次缩放手势，且详情让步链仍会挤压错误的面板。

**把按钮放在 `ui-layout`，紧邻它修改的状态。** 被上述项目引用环阻断；而且这会把一个侧边栏形态的控件放进一个完全不了解页脚几何（`wide`）的包。

**持久化该选择。** 为与布局 store 其余部分保持对称而拒绝，后者刻意保持瞬时；持久化应当让宽度、详情与位置一同到来。

## Consequences

- `LayoutState` 增加了字段，因此所有针对完整状态对象的快照断言都必须补上 `sidebarSide`；`PanelActions` 增加了方法，因此测试中的服务替身必须提供它。
- 三份侧边栏外壳快照现在在两种词典下都包含该页脚按钮。
- CSS Modules 不跨包边界，因此该按钮在本地重述页脚 28px/36px 的控件几何，而不是引入 `ui-sidebar` 的导轨度量。
