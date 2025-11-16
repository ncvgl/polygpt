## Building from Source

### Requirements

- Node.js 20+ and npm
- macOS, Windows, or Linux

### Development

1. Clone the repository:
   ```bash
   git clone https://github.com/ncvgl/polygpt.git
   cd polygpt
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm start
   ```

4. Run with DevTools (for debugging):
   ```bash
   npm run dev
   ```

### Building Distributables

Build for your current platform:

```bash
npm run build
```

Build for specific platforms:

```bash
# macOS (universal binary)
npm run build -- --mac

# Windows
npm run build -- --win

# Linux
npm run build -- --linux
```

Built files will be in the `dist/` directory.