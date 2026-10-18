# Pakistan Law Case Tools

A lightweight Chrome extension for collecting case citations from a page and opening case text in a clean print view.

## Features

- Find bookmark citations on the active page.
- Copy all citations or selected citations.
- Export selected citations to a text file.
- Open the case text in a separate print-ready tab and save it as PDF.
- Open the first 50 cases loaded in the current search results together in one print-ready view and save them as a single PDF.

## Install for development

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this project folder.

The extension updates when reloaded from the Extensions page after local source changes.

## Permissions and privacy

- `activeTab` and `scripting` are used to read citation and case content from the active tab after the extension is opened.
- `clipboardWrite` is used when you choose a copy action.
- `storage` temporarily transfers case markup to the print-view tab. That temporary entry is removed after the print view loads.

The extension does not send page content to a server or include a remote account or licensing service.

## License and ownership

Copyright (c) 2026 Muhammad Abrar. All rights reserved. See [LICENSE](./LICENSE).

This repository is public for inspection. Public visibility does not grant permission to copy, modify, redistribute, or publish this software or derivative works. For permission requests or copyright concerns, contact [Muhammad Abrar](mailto:notanothermailofme@proton.me).

## Disclaimer

This extension is an independent utility for working with text displayed on websites. It does not provide legal advice, and you should verify case materials against their authoritative source.
