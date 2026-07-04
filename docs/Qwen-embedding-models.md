> ## Documentation Index
> Fetch the complete documentation index at: https://platform.qianwenai.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 向量与重排模型

> 选择适用于语义搜索、RAG 检索、跨模态匹配和重排序的模型。

## 文本 Embedding

纯文本搜索、RAG 或聚类 → `text-embedding-v4`。
从 v3 索引迁移 → `text-embedding-v3`（维度兼容）。

### 维度如何选择？

大规模搜索且存储敏感 → 256 或 512。
通用场景 → 1024（默认，平衡性好）。
追求最高基准精度 → 1536 或 2048。

## 多模态 Embedding

通过文本检索图片或视频 → `qwen3-vl-embedding`。

### 融合向量 vs 独立向量

- **融合向量** — 将多模态输入（文本+图片+视频）编码为 1 个向量。适合图文混合检索。
- **独立向量** — 每种输入分别生成独立向量。适合跨模态检索（文本查图、文本查视频）。

`qwen3-vl-embedding` 同时支持融合和独立向量；`qwen2.5-vl-embedding` 仅支持融合向量。

### 只有文本数据？

直接用 `text-embedding-v4`——更快、更便宜、维度选择更多。
多模态 Embedding 专为跨模态检索设计（文本+图片、文本+视频）。

## 重排序

提升 RAG 精度 → 在 Embedding 检索之后接入 `qwen3-rerank`，通过交叉注意力机制对 Top-N 结果重新打分，改善排序质量。

多模态重排序 → `qwen3-vl-rerank`，支持图片和视频输入。

## 全部模型

<AccordionGroup>
  <Accordion title="文本 Embedding">
| 模型                  | 适用场景        | 维度                                           | 最大 Token 数 |
| ------------------- | ----------- | -------------------------------------------- | ---------- |
| `text-embedding-v4` | 文本搜索、RAG、聚类 | 64, 128, 256, 512, 768, 1024（默认）, 1536, 2048 | 8,192      |
| `text-embedding-v3` | v3 索引迁移     | 512, 768, 1024（默认）                           | 8,192      |
  </Accordion>

  <Accordion title="多模态 Embedding">
| 模型                                         | 适用场景            | 向量类型    | 维度                 | 最大 Token 数 |
| ------------------------------------------ | --------------- | ------- | ------------------ | ---------- |
| `qwen3-vl-embedding`                       | 图文混合检索          | 融合 + 独立 | 256\~2560（默认 2560） | 32,000     |
| `qwen2.5-vl-embedding`                     | 图文混合检索          | 仅融合     | 512\~2048（默认 1024） | 32,000     |
| `tongyi-embedding-vision-plus`             | 跨模态搜索（仅独立向量）    | 仅独立     | 64\~1152（默认 1152）  | 1,024      |
| `tongyi-embedding-vision-plus-2026-03-06`  | 跨模态搜索           | 融合 + 独立 | 64\~1152（默认 1152）  | 1,024      |
| `tongyi-embedding-vision-flash`            | 跨模态搜索，注重成本（仅独立） | 仅独立     | 64\~768（默认 768）    | 1,024      |
| `tongyi-embedding-vision-flash-2026-03-06` | 跨模态搜索，注重成本      | 融合 + 独立 | 64\~768（默认 768）    | 1,024      |
  </Accordion>

  <Accordion title="重排序">
| 模型                | 适用场景          | 最大文档数 | 单条最大 Token |
| ----------------- | ------------- | ----- | ---------- |
| `qwen3-vl-rerank` | 多模态搜索结果重排序    | 100   | 8,000      |
| `qwen3-rerank`    | 文本搜索结果重排序、RAG | 500   | 4,000      |
| `gte-rerank-v2`   | 文本语义检索、RAG    | 500   | 4,000      |
  </Accordion>

  <Accordion title="旧版模型">
    上一代模型。新项目建议使用上述最新版本。

| 模型                        | 类型               | 维度    | 最大 Token 数 |
| ------------------------- | ---------------- | ----- | ---------- |
| `text-embedding-v2`       | 文本 Embedding     | 1,536 | 2,048      |
| `text-embedding-v1`       | 文本 Embedding     | 1,536 | 2,048      |
| `text-embedding-async-v2` | 文本 Embedding（异步） | 1,536 | 2,048      |
| `text-embedding-async-v1` | 文本 Embedding（异步） | 1,536 | 2,048      |
| `multimodal-embedding-v1` | 多模态 Embedding    | 1,024 | --         |
  </Accordion>
</AccordionGroup>

---

## 了解更多

<CardGroup cols={2}>
  <Card title="文本 Embedding 指南" icon="PlugConnectedOutlined" href="/developer-guides/embeddings/text-embedding">
    生成文本 Embedding，用于搜索和 RAG。
  </Card>

  <Card title="多模态 Embedding API" icon="PlugOutlined" href="/api-reference/multimodal-embedding/dashscope-multimodal-embedding">
    跨模态 Embedding 的 API 参考文档。
  </Card>
</CardGroup>
