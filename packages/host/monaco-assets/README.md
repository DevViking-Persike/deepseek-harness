# @deepseek-ai/dsh-host-monaco-assets

English | [中文](README.zh.md)

Serves the [Monaco Editor](https://github.com/microsoft/monaco-editor) distribution to the browser over a host HTTP route.

## Why a route rather than a bundle

The browser plugin channel delivers exactly one file per plugin (`/plugins/<id>/client.js`), and the dynamic bundler emits no extra chunks or assets. Monaco is a multi-file distribution — an AMD loader, per-language modules, and a stylesheet — so it cannot arrive that way.

This plugin mounts those files under a route of its own, reading them from the installed `monaco-editor` package. The editor therefore stays local: no CDN at runtime, and no third-party origin inside a tool that reads the operator's source tree.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `route` | `/monaco` | Absolute URL prefix, without a trailing slash. |

```yaml
- id: monaco-assets
  name: '@deepseek-ai/dsh-host-monaco-assets'
  config:
    route: /vendor/monaco
```

A route that is not absolute, or that ends in a slash, fails at load rather than serving from an ambiguous prefix.

## Consuming it

Monaco publishes itself through its own AMD loader:

```js
await loadScript('/monaco/loader.js')
window.require.config({ paths: { vs: '/monaco' } })
window.require(['vs/editor/editor.main'], () => {
  window.monaco.editor.create(host, { value: '', language: 'typescript' })
})
```

## Model Experience

None, as this package serves static editor bytes to the browser and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **The whole distribution is served** — including language modules a given page never loads. Serving a subset would require knowing each consumer's languages up front, which the route cannot see.
- **Responses are cached for a week as immutable** — safe because the distribution is version-pinned by the installed package, but a Monaco upgrade needs a cache-busting route change or a hard reload to reach an open tab.
- **Files are read per request with no in-process cache** — the operating system's page cache absorbs this, and holding a 24 MB distribution in heap has no current consumer.
- **Web workers are not configured** — a consumer that wants them must serve its own worker entry and set `MonacoEnvironment`; without one, Monaco runs its language services on the main thread.
