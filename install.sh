#!/usr/bin/env bash
set -euo pipefail

REPO="sankeerthreddy1597/liteocode"
BIN="liteocode"
INSTALL_DIR="${LITEOCODE_INSTALL_DIR:-$HOME/.local/bin}"

# Detect OS
OS=$(uname -s)
case "$OS" in
  Linux)  OS="linux"  ;;
  Darwin) OS="darwin" ;;
  *)
    echo "error: unsupported OS: $OS" >&2
    exit 1
    ;;
esac

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64)  ARCH="x64"   ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    echo "error: unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

if [[ "$OS" == "darwin" && "$ARCH" == "x64" ]]; then
  echo "error: Intel Macs are not supported. Only Apple Silicon (arm64) is available." >&2
  exit 1
fi

ASSET="${BIN}-${OS}-${ARCH}"
URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

echo "Downloading liteocode (${OS}/${ARCH})..."
curl -fsSL "$URL" -o "/tmp/${BIN}"
chmod +x "/tmp/${BIN}"

mkdir -p "$INSTALL_DIR"
mv "/tmp/${BIN}" "${INSTALL_DIR}/${BIN}"

echo "Installed to ${INSTALL_DIR}/${BIN}"
echo ""

# Warn if install dir is not on PATH
if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
  SHELL_RC="$HOME/.bashrc"
  [[ "${SHELL:-}" == */zsh ]] && SHELL_RC="$HOME/.zshrc"
  echo "Note: ${INSTALL_DIR} is not in your PATH."
  echo "Add it by running:"
  echo ""
  echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ${SHELL_RC} && source ${SHELL_RC}"
  echo ""
fi

echo "Run: liteocode"
