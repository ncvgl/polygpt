# PolyGPT

Mirror text to ChatGPT and Gemini simultaneously. Type once in a bottom control bar and watch your text appear in both AI interfaces side-by-side.

## Features

- **Side-by-side display**: ChatGPT on the left, Gemini on the right
- **Live text mirroring**: Type in the bottom bar, see updates instantly in both interfaces
- **Session persistence**: Stay logged into both services across app restarts
- **Automatic selector discovery**: Finds input elements even if the UIs change slightly
- **Keyboard shortcuts**: Shift+Enter to submit to both services

## Requirements

- Node.js 14+ and npm
- macOS, Windows, or Linux

## Installation

1. Clone or download the project
2. Install dependencies:
   ```bash
   npm install
   ```

## Development

Start the app in development mode (with DevTools):

```bash
npm run dev
```

## Building

Create a distribution build:

```bash
npm run build
```

## Architecture

- **Main Process** (`src/main/index.js`): Manages app lifecycle and window setup
- **Window Manager** (`src/main/window-manager.js`): Creates and configures WebContentsViews
- **Preload Scripts** (`src/preload/`): Inject text into ChatGPT and Gemini interfaces
- **Renderer** (`src/renderer/`): Bottom control bar for text input
- **Config** (`config/selectors.json`): DOM selectors for finding input elements

## How It Works

1. **Text Input**: Type in the bottom control bar
2. **Throttled Updates**: Input is throttled at 50ms intervals for smooth typing
3. **Preload Injection**: Preload scripts find the input elements on both sites
4. **Event Dispatch**: DOM events are dispatched to trigger React/framework detection
5. **Auto-Submit**: Shift+Enter can submit to both services simultaneously

## Selector Configuration

DOM selectors for both ChatGPT and Gemini are stored in `config/selectors.json`. If either interface updates and text stops appearing:

1. Click the "Retry" button when an error appears
2. Or manually update the selectors in `config/selectors.json` with new ones

### Finding Selectors

Use browser DevTools to inspect elements:

- **ChatGPT**: Look for the main message input textarea or contenteditable div
- **Gemini**: Look for the `rich-textarea` element or contenteditable input area

## Troubleshooting

### Text not appearing in one or both interfaces

1. Check the error banner at the bottom for selector errors
2. Click "Retry" to rescan the DOM
3. If error persists, use DevTools (in dev mode) to find the correct selectors
4. Update `config/selectors.json` with the new selectors

### App won't start

- Ensure Node.js is installed
- Try `npm install` again
- Check that `package.json` exists and dependencies are installed

### User not staying logged in

- Make sure you're using Chrome/Chromium (same session manager as Electron)
- Clear any conflicting cookies/cache in `~/.config/PolyGPT`

## Notes

- This app does not use any external APIs or backend services
- Sessions are persistent - you stay logged in via your browser session
- The app mirrors keystrokes at the DOM level, not via API
- Works with the official ChatGPT and Gemini consumer interfaces

## License

MIT
