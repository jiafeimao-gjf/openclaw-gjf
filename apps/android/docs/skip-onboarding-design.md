# 技术方案：关闭首屏四步校验，支持直接配置本地 OpenClaw

## 一、当前流程分析

```
首次启动
    │
    ▼
RootScreen 检查 onboardingCompleted
    │
    ├── false → OnboardingFlow (四步)
    │       ├── Step 1: Welcome (介绍)
    │       ├── Step 2: Gateway (连接配置)
    │       ├── Step 3: Permissions (权限)
    │       └── Step 4: FinalCheck (确认)
    │
    └── true → PostOnboardingTabs (主界面)
```
206ceba726a8668710bfdd5562f36f9bda0e47f72465329f

### 现有存储（SecurePrefs）

| Key | 描述 |
|-----|------|
| `gateway.manual.enabled` | Manual 模式开关 |
| `gateway.manual.host` | Manual 模式 Host |
| `gateway.manual.port` | 端口 (默认 18789) |
| `gateway.manual.tls` | TLS 开关 |
| `gateway.token.{instanceId}` | 网关 Token |
| `gateway.password.{instanceId}` | 网关密码 |
| `onboarding.completed` | onboarding 是否完成 |

## 二、方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **A: 跳过四步，直接进设置** | 用户点击跳过 → 直接显示 ConnectTab + SettingsSheet | 实现简单，保留权限控制 | 需要手动配置 |
| **B: 预设本地配置** | 检测到特定环境变量/adb 命令 → 自动填入 `127.0.0.1:18789, TLS=off` | 一行命令快速配置 | 需要开发者启用 |
| **C: 静默模式** | 检测到已有 gateway 配置 → 完全跳过 onboarding | 用户无感知 | 权限可能被跳过 |

## 三、推荐方案：方案 A（跳过按钮 + 快速手动配置）

```
┌─────────────────────────────────────────────┐
│              OnboardingFlow                  │
├─────────────────────────────────────────────┤
│  WelcomeStep                                │
│  ├── "What You Get"                         │
│  ├── 功能介绍 Bullet Points                 │
│  ├── [Skip / 跳过]  ← 新增按钮              │
│  └── [Continue / 继续] → GatewayStep        │
└─────────────────────────────────────────────┘
```

### 实现要点

1. **WelcomeStep 增加「跳过」按钮**
   - 点击后设置 `onboardingCompleted = true`
   - 跳转到 PostOnboardingTabs（ConnectTab）
   - 用户可后续在 Settings → Gateway 手动配置

2. **检测已有手动配置时可选跳过**
   - 如果 `manualEnabled = true` 且 host 已填
   - 可在 WelcomeStep 显示「已有配置，是否跳过？」

3. **权限处理**
   - 跳过后的权限在首次使用时按需请求（现有逻辑已支持）
   - 或在 Settings 中提供快捷权限入口

## 四、需要修改的文件

| 文件 | 修改内容 |
|------|----------|
| `ui/OnboardingFlow.kt` | WelcomeStep 增加 Skip 按钮 |
| `ui/RootScreen.kt` | 可能需要调整状态检查逻辑 |
| `ui/SettingsSheet.kt` | 可选：增加快速连接配置入口 |

## 五、代码修改方案

### 文件：`ui/OnboardingFlow.kt`

#### 1. 修改 WelcomeStep 函数签名和按钮区域（第 769-785 行）

**当前代码：**
```kotlin
OnboardingStep.Welcome -> {
  Button(
    onClick = { step = OnboardingStep.Gateway },
    modifier = Modifier.weight(1f).height(52.dp),
    shape = RoundedCornerShape(14.dp),
    colors =
      ButtonDefaults.buttonColors(
        containerColor = onboardingAccent,
        contentColor = Color.White,
        disabledContainerColor = onboardingAccent.copy(alpha = 0.45f),
        disabledContentColor = Color.White,
      ),
  ) {
    Text("Next", style = onboardingHeadlineStyle.copy(fontWeight = FontWeight.Bold))
  }
}
```

**修改为：**
```kotlin
OnboardingStep.Welcome -> {
  Row(
    modifier = Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    // Skip 按钮
    Button(
      onClick = { viewModel.setOnboardingCompleted(true) },
      modifier = Modifier.weight(1f).height(52.dp),
      shape = RoundedCornerShape(14.dp),
      colors =
        ButtonDefaults.buttonColors(
          containerColor = onboardingSurface,
          contentColor = onboardingTextSecondary,
        ),
    ) {
      Text("Skip", style = onboardingHeadlineStyle.copy(fontWeight = FontWeight.SemiBold))
    }
    // Continue 按钮
    Button(
      onClick = { step = OnboardingStep.Gateway },
      modifier = Modifier.weight(1f).height(52.dp),
      shape = RoundedCornerShape(14.dp),
      colors =
        ButtonDefaults.buttonColors(
          containerColor = onboardingAccent,
          contentColor = Color.White,
          disabledContainerColor = onboardingAccent.copy(alpha = 0.45f),
          disabledContentColor = Color.White,
        ),
    ) {
      Text("Continue", style = onboardingHeadlineStyle.copy(fontWeight = FontWeight.Bold))
    }
  }
}
```

#### 2. （可选）检测已有配置时显示提示

在 WelcomeStep 函数开始处（第 954-961 行）添加检测逻辑：

```kotlin
@Composable
private fun WelcomeStep(
  hasExistingConfig: Boolean,  // 新增参数
) {
  // 在 StepShell 内部、条件渲染提示
  StepShell(title = "What You Get") {
    if (hasExistingConfig) {
      Text(
        "You have an existing gateway configuration.",
        style = onboardingCalloutStyle,
        color = onboardingSuccess,
      )
    }
    // ... 原有 Bullet 内容
  }
}
```

调用处（第 559 行）需要传递参数：
```kotlin
OnboardingStep.Welcome -> WelcomeStep(
  hasExistingConfig = manualEnabled && manualHost.isNotBlank()
)
```

### 文件：`ui/RootScreen.kt`

**无需修改** - 现有逻辑已支持：
- `onboardingCompleted = true` → 直接显示 PostOnboardingTabs
- PostOnboardingTabs 包含 ConnectTab，用户可在 ConnectTab 配置 gateway

### 文件：`ui/SettingsSheet.kt`（可选增强）

可选：增加快捷权限入口，方便用户在跳过 onboarding 后快速授予权限。

## 六、Skip 后自动连接本地服务

### 需求分析

点击 Skip 后，希望自动连接到本地 OpenClaw 服务（`127.0.0.1:18789, TLS=off`），而不是让用户手动配置。

### 当前 Skip 行为

```
Skip 点击
  │
  ▼
setOnboardingCompleted(true)
  │
  ▼
RootScreen 显示 PostOnboardingTabs (ConnectTab)
  │
  ▼
用户需手动在 ConnectTab 填写 127.0.0.1:18789 并点击连接
```

### 目标行为

```
Skip 点击
  │
  ├── setOnboardingCompleted(true)
  ├── setManualEnabled(true)
  ├── setManualHost("127.0.0.1")
  ├── setManualPort(18789)
  ├── setManualTls(false)
  │
  ▼
connectManual() 自动连接
  │
  ▼
RootScreen 显示 PostOnboardingTabs (已连接状态)
```

### 代码修改方案

#### 文件：`ui/OnboardingFlow.kt`

**当前 Skip 按钮代码：**
```kotlin
Button(
  onClick = { viewModel.setOnboardingCompleted(true) },
  ...
)
```

**修改为：**
```kotlin
Button(
  onClick = {
    // 自动配置本地网关
    // 模拟器使用 10.0.2.2 访问宿主机 localhost
    // 真机 USB 调试需先运行 adb reverse tcp:18789 tcp:18789
    viewModel.setManualEnabled(true)
    viewModel.setManualHost("10.0.2.2")  // 模拟器访问宿主机
    viewModel.setManualPort(18789)
    viewModel.setManualTls(false)
    // 跳过 onboarding
    viewModel.setOnboardingCompleted(true)
    // 自动连接
    viewModel.connectManual()
  },
  ...
)
```

> **注意**：如果需要同时支持真机 USB 调试，可以：
> - 检测运行环境（模拟器 vs 真机）
> - 或让用户在 Settings 中手动切换 IP（127.0.0.1 vs 10.0.2.2）

### 配对授权问题

当 Android 节点首次连接 Gateway 时，Gateway 会弹出配对请求，需要手动批准。

#### 解决方案：Skip 后提示用户手动批准

**修改 Skip 按钮逻辑**，在连接后显示提示：

```kotlin
Button(
  onClick = {
    viewModel.setManualEnabled(true)
    viewModel.setManualHost("10.0.2.2")
    viewModel.setManualPort(18789)
    viewModel.setManualTls(false)
    viewModel.setOnboardingCompleted(true)
    viewModel.connectManual()
    // TODO: 显示配对提示 UI
  },
  ...
)
```

**需要添加 UI 提示**，告知用户在 Gateway 侧运行：
```bash
openclaw devices approve --latest
```

可以在以下位置添加提示：
1. ConnectTab - 显示"等待配对批准"状态 + CLI 命令提示
2. Toast/Snackbar - 连接后短暂显示

#### Gateway 自动批准（可选，复杂）

如果需要完全自动化，可以：
1. 在 Gateway 配置 `OPENCLAW_AUTO_APPROVE_NODES=true`
2. 或使用 Setup Code 模式（包含预共享密钥）

但这需要修改 Gateway 代码，当前不推荐。

### 相关代码位置

| 文件 | 位置 | 说明 |
|------|------|------|
| `MainViewModel.kt` | 第 154 行 | `connectManual()` |
| `NodeRuntime.kt` | 第 764 行 | `connectManual()` 实现 |
| `SecurePrefs.kt` | 第 137-156 行 | manual 配置存储 |

## 七、方案优势

- **最小改动**：只需在 WelcomeStep 的按钮区域添加 Skip 按钮
- **向后兼容**：现有四步流程完全保留
- **灵活**：用户可选择配置或跳过
- **权限安全**：权限仍按需授予，不强制
