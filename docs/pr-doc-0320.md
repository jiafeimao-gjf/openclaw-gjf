## Summary

- **Problem:** OpenClaw 文档缺少中文版的 Channel 插件开发指南，中文社区开发者无法直接获取构建扩展和理解插件架构的完整文档。
- **Why it matters:** 文档是社区贡献的入口，缺失中文文档会阻碍中文开发者参与插件/Channel 开发。
- **What changed:** 新增两篇中文文档：
  - `docs/zh-CN/plugins/building-extensions.md` — 构建扩展完整步骤
  - `docs/zh-CN/plugins/architecture.md` — 插件架构内部原理
- **What did NOT change:** 未修改任何英文原文、未改动代码逻辑、未变更插件系统行为。

---

## Change Type

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor
- [x] **Docs**
- [ ] Security hardening
- [ ] Chore/infra

---

## Scope

- [ ] Gateway / orchestration
- [ ] Skills / tool execution
- [ ] Auth / tokens
- [ ] Memory / storage
- [ ] Integrations
- [ ] API / contracts
- [ ] UI / DX
- [x] **CI/CD / infra**（文档）

---

## Linked Issue / PR

- Closes #
- Related #

---

## User-Visible / Behavior Changes

**None.** 文档仅影响文档站点内容，不改变运行时行为。

---

## Security Impact

| Item | Changed? |
|------|----------|
| New permissions/capabilities | No |
| Secrets/tokens handling changed | No |
| New/changed network calls | No |
| Command/tool execution surface changed | No |
| Data access scope changed | No |

---

## Repro + Verification

### Environment

- **OS:** macOS / Linux
- **Runtime/container:** N/A
- **Model/provider:** N/A
- **Integration/channel (if any):** N/A
- **Relevant config (redacted):** N/A

### Steps

1. 确认 `docs/zh-CN/plugins/building-extensions.md` 和 `docs/zh-CN/plugins/architecture.md` 存在且内容完整。
2. 对照英文原文 `docs/plugins/building-extensions.md` 和 `docs/plugins/architecture.md`，验证关键术语和代码示例翻译准确。
3. 确认文档结构符合 Mintlify 中文文档规范（根相对路径链接、无 `.md` 后缀）。

### Expected

两篇文档已正确创建，内容与英文原版一致，中文表达流畅。

### Actual

-

---

## Evidence

- [x] 新增文件已写入 `docs/zh-CN/plugins/` 目录
- [ ] Screenshot/recording
- [ ] Perf numbers (if relevant)

---

## Human Verification

- **Verified scenarios:** 文件已写入，frontmatter 完整，代码块、表格、链接格式正确。
- **Edge cases checked:** 中文标题中的特殊字符、Em dashes/apostrophes 已按 Mintlify 锚点规则避免。
- **What you did not verify:** 未在 Mintlify 本地预览环境验证渲染效果，未实际依据此文档开发 Channel 插件来验证步骤可操作性。

---

## Review Conversations

- [ ] I replied to or resolved every bot review conversation I addressed in this PR.
- [ ] I left unresolved only the conversations that still need reviewer or maintainer judgment.

---

## Compatibility / Migration

| Item | Answer |
|------|--------|
| Backward compatible? | Yes |
| Config/env changes? | No |
| Migration needed? | No |

---

## Failure Recovery

- **How to disable/revert this change quickly:** `git revert` 删除两个新增文件即可。
- **Files/config to restore:** 无
- **Known bad symptoms reviewers should watch for:** Mintlify 构建警告（broken link、missing asset）

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| 文档内部链接路径或锚点错误，在 Mintlify 中失效 | 提交前运行文档构建检查或人工核对所有根相对路径链接格式 |
| `zh-CN/plugins/` 新增文件与 i18n pipeline 冲突，可能被覆盖 | 纯新增文件，不修改英文原文，pipeline 应只处理翻译而非新增文档 |
