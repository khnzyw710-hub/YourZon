# Wake Word Models

Place custom Picovoice Porcupine `.ppn` model files here.

## Custom Hebrew Wake Word ("היי זון")

1. Create a free account at https://console.picovoice.ai/
2. Go to **Porcupine** → **Train** → enter "היי זון" (or your preferred phrase)
3. Download the `.ppn` file for your target platform (Android / iOS)
4. Copy the file here: `assets/wake-words/hey-zon-[platform].ppn`
5. In app Settings, enter your Picovoice Access Key

## Default Behavior

Without a `.ppn` file the app falls back to JS string-matching against `settings.wakeWord`.
This is slightly less responsive (~200ms) but requires no Picovoice account.

## Supported Files

| File | Platform |
|------|----------|
| `hey-zon-android.ppn` | Android |
| `hey-zon-ios.ppn` | iOS |

The metro.config.js already registers `.ppn` and `.pv` as asset extensions so they
are bundled correctly by Expo's packager.
