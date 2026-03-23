# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenClaw Android App - a native Kotlin + Jetpack Compose mobile application that connects to the OpenClaw gateway to provide remote device control capabilities.

Status: **extremely alpha** - actively being rebuilt.

## Build / Run Commands

```bash
cd apps/android

# Build and install
./gradlew :app:assembleDebug
./gradlew :app:installDebug

# Run tests
./gradlew :app:testDebugUnitTest

# Lint and format (via pnpm from repo root)
pnpm android:lint
pnpm android:format

# Android framework lint (separate pass)
pnpm android:lint:android

# Direct Gradle lint tasks
./gradlew :app:ktlintCheck :benchmark:ktlintCheck
./gradlew :app:ktlintFormat :benchmark:ktlintFormat
./gradlew :app:lintDebug
```

**Gradle wrapper**: Uses Gradle 9.2.1 (configured in `gradle/wrapper/gradle-wrapper.properties`). Auto-detects Android SDK at `~/Library/Android/sdk` if `ANDROID_SDK_ROOT`/`ANDROID_HOME` unset.

## Architecture

- **Language**: Kotlin with Jetpack Compose for UI
- **Architecture**: MVVM with `MainViewModel` as durable UI state
- **Min SDK**: 31 (Android 12)
- **Target SDK**: 36
- **Java**: 17

### Source Structure

```
app/src/main/java/ai/openclaw/app/
├── MainActivity.kt, MainViewModel.kt   # Entry point and app state
├── NodeApp.kt                           # Application class
├── NodeForegroundService.kt            # Foreground service
├── ui/                                 # Compose UI screens
│   ├── RootScreen.kt                   # Main navigation
│   ├── OnboardingFlow.kt               # 4-step onboarding
│   ├── ConnectTabScreen.kt             # Gateway connection
│   ├── ChatSheet.kt                    # Chat UI
│   ├── VoiceTabScreen.kt                # Voice tab
│   ├── CanvasScreen.kt                 # Screen/canvas tab
│   ├── SettingsSheet.kt                 # Settings
│   └── chat/                           # Chat components
├── node/                               # Node command handlers
│   ├── InvokeDispatcher.kt              # Command routing
│   ├── InvokeCommandRegistry.kt         # Available commands
│   ├── ConnectionManager.kt             # Gateway connection
│   └── handlers/ (Camera, Sms, etc.)   # Capability handlers
├── gateway/                            # Gateway protocol
│   ├── GatewaySession.kt                # WebSocket session
│   ├── GatewayProtocol.kt               # Protocol handling
│   └── DeviceAuthStore.kt              # Auth state
├── chat/                               # Chat logic
├── voice/                              # Voice/TTS functionality
└── protocol/                           # A2UI protocol
```

### UI Architecture Rules

- Durable UI state in `MainViewModel`
- Composables: state in, callbacks out
- No business/network logic in composables
- Keep side effects explicit via `LaunchedEffect`, activity result APIs

## Style Guide

See `style.md` for complete design tokens. Key points:

- **Typography**: Manrope font family (400/500/600/700 weights)
- **Colors**: Defined in `MobileUiTokens.kt` - light neutral background, blue accent (#1D5DD8)
- **Touch targets**: Minimum 44dp
- **Source of truth for implementation**:
  - `app/src/main/java/ai/openclaw/app/ui/OpenClawTheme.kt`
  - `app/src/main/java/ai/openclaw/app/ui/OnboardingFlow.kt`
  - `app/src/main/java/ai/openclaw/app/ui/RootScreen.kt`

## Testing

- **Unit tests**: `./gradlew :app:testDebugUnitTest`
- **Macrobenchmark**: `./gradlew :benchmark:connectedDebugAndroidTest`
- **Perf CLI**: `./scripts/perf-startup-benchmark.sh`, `./scripts/perf-startup-hotspots.sh`
- **Integration tests** (requires gateway + paired device): `pnpm android:test:integration`

## USB Debugging

For local testing without LAN:

```bash
# Terminal A: Run gateway
pnpm openclaw gateway --port 18789 --verbose

# Terminal B: USB tunnel
adb reverse tcp:18789 tcp:18789

# In app Connect → Manual:
# Host: 127.0.0.1, Port: 18789, TLS: off
```

## Permissions

- Discovery: `NEARBY_WIFI_DEVICES` (Android 13+), `ACCESS_FINE_LOCATION` (Android 12-)
- Foreground service: `POST_NOTIFICATIONS` (Android 13+)
- Camera: `CAMERA`, `RECORD_AUDIO` (for `camera.clip`)

## Dependencies

Key dependencies (see `app/build.gradle.kts`):
- Jetpack Compose (BOM 2026.02.00)
- Kotlin Coroutines
- Kotlin Serialization
- OkHttp
- BouncyCastle
- CameraX
- ZXing (QR scanning)
- dnsjava (Bonjour/NSD)
