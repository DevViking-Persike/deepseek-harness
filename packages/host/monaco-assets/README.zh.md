# @deepseek-ai/dsh-host-monaco-assets

[English](README.md) | 中文

通过宿主 HTTP 路由，向浏览器提供 [Monaco Editor](https://github.com/microsoft/monaco-editor) 发行版。

## 为什么用路由而不是打包

浏览器插件通道对每个插件只投递一个文件（`/plugins/<id>/client.js`），而动态打包器不会产出额外的 chunk 或资源。Monaco 是一个多文件发行版——一个 AMD loader、按语言划分的模块，以及一份样式表——因此无法以那种方式送达。

本插件把这些文件挂载在自己的一条路由下，从已安装的 `monaco-editor` 包中读取它们。编辑器因此始终保持在本地：运行时不依赖 CDN，在一个会读取操作者源码树的工具内部也不引入第三方来源。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `route` | `/monaco` | 绝对 URL 前缀，不带结尾斜杠。 |

```yaml
- id: monaco-assets
  name: '@deepseek-ai/dsh-host-monaco-assets'
  config:
    route: /vendor/monaco
```

不是绝对路径、或以斜杠结尾的路由会在加载时失败，而不是从一个有歧义的前缀提供服务。

## 如何使用

Monaco 通过它自己的 AMD loader 发布自身：

```js
await loadScript('/monaco/loader.js')
window.require.config({ paths: { vs: '/monaco' } })
window.require(['vs/editor/editor.main'], () => {
  window.monaco.editor.create(host, { value: '', language: 'typescript' })
})
```

## 模型体验

无，因为本包只向浏览器提供静态的编辑器字节，不触及 prompt、消息、schema、流或工具结果。

#### KV Cache 影响

无；本包从不组装或发送 provider 请求。

## 已知限制与暂缓事项

- **整个发行版都会被提供** —— 包括某个页面从不加载的语言模块。只提供其中一个子集需要事先知道每个消费方用到哪些语言，而该路由看不到这一信息。
- **响应以 immutable 缓存一周** —— 这是安全的，因为发行版的版本由已安装的包固定；但 Monaco 升级要抵达一个已打开的标签页，需要一次能绕开缓存的路由变更或一次强制刷新。
- **文件按请求读取，没有进程内缓存** —— 操作系统的页缓存吸收了这部分开销，而把一个 24 MB 的发行版常驻堆内存目前没有任何消费方需要。
- **未配置 web worker** —— 需要 worker 的消费方必须自行提供 worker 入口并设置 `MonacoEnvironment`；没有 worker 时，Monaco 会在主线程上运行它的语言服务。
