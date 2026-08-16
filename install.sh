#!/usr/bin/env bash

set -Eeuo pipefail

UI_LANG="${FOURIER_INSTALL_LANG:-}"
OS_NAME=""
LINUX_PACKAGE_MANAGER=""

if [[ -t 1 ]]; then
  COLOR_BLUE='\033[1;34m'
  COLOR_GREEN='\033[1;32m'
  COLOR_YELLOW='\033[1;33m'
  COLOR_RED='\033[1;31m'
  COLOR_RESET='\033[0m'
else
  COLOR_BLUE=''
  COLOR_GREEN=''
  COLOR_YELLOW=''
  COLOR_RED=''
  COLOR_RESET=''
fi

usage() {
  cat <<'EOF'
Fourier one-click installer / Fourier 一键安装脚本

Usage / 用法:
  bash install.sh [--lang zh|en]

Options / 选项:
  --lang zh|en    Select the interface language / 选择界面语言
  -h, --help      Show this help / 显示帮助

The language can also be set with FOURIER_INSTALL_LANG=zh or en.
也可以通过 FOURIER_INSTALL_LANG=zh 或 en 设置语言。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lang)
      if [[ $# -lt 2 ]]; then
        printf 'Missing value for --lang / --lang 缺少参数\n' >&2
        usage
        exit 2
      fi
      UI_LANG="$2"
      shift 2
      ;;
    --lang=*)
      UI_LANG="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s / 未知选项：%s\n' "$1" "$1" >&2
      usage
      exit 2
      ;;
  esac
done

choose_language() {
  case "$UI_LANG" in
    zh|zh-CN|zh_CN|cn|CN|1)
      UI_LANG="zh"
      return
      ;;
    en|en-US|en_US|EN|2)
      UI_LANG="en"
      return
      ;;
    '')
      ;;
    *)
      printf 'Unsupported language: %s. Use zh or en.\n' "$UI_LANG" >&2
      exit 2
      ;;
  esac

  if [[ -t 0 ]]; then
    printf '请选择语言 / Choose a language:\n'
    printf '  1) 中文\n'
    printf '  2) English\n'
    printf '> '
    local selection=""
    if read -r selection; then
      case "$selection" in
        2|en|EN|English|english) UI_LANG="en" ;;
        *) UI_LANG="zh" ;;
      esac
      return
    fi
  fi

  case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in
    zh*) UI_LANG="zh" ;;
    *) UI_LANG="en" ;;
  esac
}

message() {
  if [[ "$UI_LANG" == "zh" ]]; then
    printf '%b\n' "$1"
  else
    printf '%b\n' "$2"
  fi
}

step() {
  if [[ "$UI_LANG" == "zh" ]]; then
    printf '\n%b==>%b %s\n' "$COLOR_BLUE" "$COLOR_RESET" "$1"
  else
    printf '\n%b==>%b %s\n' "$COLOR_BLUE" "$COLOR_RESET" "$2"
  fi
}

success() {
  if [[ "$UI_LANG" == "zh" ]]; then
    printf '%b✓%b %s\n' "$COLOR_GREEN" "$COLOR_RESET" "$1"
  else
    printf '%b✓%b %s\n' "$COLOR_GREEN" "$COLOR_RESET" "$2"
  fi
}

warn() {
  if [[ "$UI_LANG" == "zh" ]]; then
    printf '%b!%b %s\n' "$COLOR_YELLOW" "$COLOR_RESET" "$1"
  else
    printf '%b!%b %s\n' "$COLOR_YELLOW" "$COLOR_RESET" "$2"
  fi
}

die() {
  if [[ "$UI_LANG" == "zh" ]]; then
    printf '%b错误：%b%s\n' "$COLOR_RED" "$COLOR_RESET" "$1" >&2
  else
    printf '%bError:%b %s\n' "$COLOR_RED" "$COLOR_RESET" "$2" >&2
  fi
  exit 1
}

run_privileged() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    die \
      "安装系统依赖需要管理员权限，但系统中没有 sudo。请使用 root 账户运行脚本。" \
      "Administrator privileges are required, but sudo is unavailable. Run this script as root."
  fi
}

detect_os() {
  case "$(uname -s)" in
    Darwin)
      OS_NAME="macos"
      if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
        die \
          "请不要使用 sudo 运行整个脚本；Homebrew 会在需要时单独请求密码。" \
          "Do not run the entire script with sudo; Homebrew will request a password when needed."
      fi
      ;;
    Linux)
      OS_NAME="linux"
      ;;
    *)
      die \
        "当前仅支持 macOS 和 Linux。" \
        "Only macOS and Linux are currently supported."
      ;;
  esac
}

detect_linux_package_manager() {
  local candidate
  for candidate in apt-get dnf yum pacman zypper apk; do
    if command -v "$candidate" >/dev/null 2>&1; then
      LINUX_PACKAGE_MANAGER="$candidate"
      return
    fi
  done

  die \
    "未找到受支持的包管理器（apt、dnf、yum、pacman、zypper 或 apk），请先手动安装 curl、FFmpeg 和 ffprobe。" \
    "No supported package manager was found (apt, dnf, yum, pacman, zypper, or apk). Install curl, FFmpeg, and ffprobe manually first."
}

install_linux_packages() {
  case "$LINUX_PACKAGE_MANAGER" in
    apt-get)
      run_privileged apt-get update
      run_privileged env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
      ;;
    dnf)
      run_privileged dnf install -y "$@"
      ;;
    yum)
      run_privileged yum install -y "$@"
      ;;
    pacman)
      run_privileged pacman -S --needed --noconfirm "$@"
      ;;
    zypper)
      run_privileged zypper --non-interactive install "$@"
      ;;
    apk)
      run_privileged apk add --no-cache "$@"
      ;;
  esac
}

ensure_bun_prerequisites() {
  if command -v curl >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1; then
    success "curl 和 unzip 已安装。" "curl and unzip are already installed."
    return
  fi

  if [[ "$OS_NAME" == "linux" ]]; then
    local packages=(ca-certificates)
    if ! command -v curl >/dev/null 2>&1; then
      packages+=(curl)
    fi
    if ! command -v unzip >/dev/null 2>&1; then
      packages+=(unzip)
    fi
    step "安装 Bun 所需的 curl/unzip" "Installing curl/unzip prerequisites for Bun"
    install_linux_packages "${packages[@]}"
  else
    die \
      "系统中缺少 curl 或 unzip。请先通过 macOS 系统更新或 Xcode Command Line Tools 安装，然后重试。" \
      "curl or unzip is unavailable. Install it through a macOS update or Xcode Command Line Tools, then retry."
  fi
}

ensure_bun() {
  step "检查 Bun" "Checking Bun"
  if command -v bun >/dev/null 2>&1; then
    success "已检测到 Bun：$(bun --version)" "Bun is already available: $(bun --version)"
    return
  fi

  message \
    "即将通过 Bun 官方安装脚本安装（curl -fsSL https://bun.sh/install | bash）。" \
    "Bun will be installed with its official installer (curl -fsSL https://bun.sh/install | bash)."
  curl -fsSL https://bun.sh/install | bash

  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if ! command -v bun >/dev/null 2>&1; then
    die \
      "Bun 安装完成，但当前进程找不到 bun。请检查 $BUN_INSTALL/bin。" \
      "Bun finished installing, but bun is not available in this process. Check $BUN_INSTALL/bin."
  fi
  success "Bun 安装完成：$(bun --version)" "Bun installed: $(bun --version)"
}

activate_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    return
  fi

  if [[ -x /opt/homebrew/bin/brew ]]; then
    export PATH="/opt/homebrew/bin:$PATH"
  elif [[ -x /usr/local/bin/brew ]]; then
    export PATH="/usr/local/bin:$PATH"
  fi
}

ensure_homebrew() {
  activate_homebrew
  if command -v brew >/dev/null 2>&1; then
    success "Homebrew 已安装。" "Homebrew is already installed."
    return
  fi

  step "安装 Homebrew（macOS 使用 Homebrew 安装 FFmpeg）" "Installing Homebrew (used to install FFmpeg on macOS)"
  message \
    "Homebrew 安装过程中可能会请求管理员密码，请按照屏幕提示操作。" \
    "Homebrew may request your administrator password; follow the on-screen instructions."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  activate_homebrew

  if ! command -v brew >/dev/null 2>&1; then
    die \
      "Homebrew 已运行安装程序，但仍无法找到 brew。请按照安装程序末尾的 PATH 提示操作后重试。" \
      "The Homebrew installer ran, but brew is still unavailable. Follow its final PATH instructions, then retry."
  fi
  success "Homebrew 安装完成。" "Homebrew installed."
}

ensure_ffmpeg() {
  step "检查 FFmpeg 和 ffprobe" "Checking FFmpeg and ffprobe"
  if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
    success "FFmpeg 和 ffprobe 已安装。" "FFmpeg and ffprobe are already installed."
    return
  fi

  if [[ "$OS_NAME" == "macos" ]]; then
    ensure_homebrew
    step "使用 Homebrew 安装 FFmpeg" "Installing FFmpeg with Homebrew"
    brew install ffmpeg
  else
    step "使用系统包管理器安装 FFmpeg" "Installing FFmpeg with the system package manager"
    install_linux_packages ffmpeg
  fi

  if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
    die \
      "FFmpeg 安装命令已结束，但没有同时找到 ffmpeg 和 ffprobe。" \
      "The FFmpeg installation command finished, but ffmpeg and ffprobe are not both available."
  fi
  success "FFmpeg 安装完成：$(ffmpeg -version | head -n 1)" "FFmpeg installed: $(ffmpeg -version | head -n 1)"
}

install_fourier_packages() {
  step "全局安装 Fourier SDK 和 Render Engine" "Installing the Fourier SDK and Render Engine globally"
  bun add --global @fourier-video/sdk @fourier-video/render-engine
  success \
    "已全局安装 @fourier-video/sdk 和 @fourier-video/render-engine。" \
    "Installed @fourier-video/sdk and @fourier-video/render-engine globally."
}

install_chromium() {
  step "安装 Chromium 及其系统依赖" "Installing Chromium and its system dependencies"
  if [[ "$OS_NAME" == "linux" && "${EUID:-$(id -u)}" -ne 0 ]]; then
    warn \
      "Playwright 在 Linux 上安装系统依赖时可能会请求 sudo 密码。" \
      "Playwright may request your sudo password while installing Linux system dependencies."
  fi
  bunx playwright install --with-deps chromium
  success "Chromium 安装完成。" "Chromium installed."
}

print_summary() {
  local bun_version ffmpeg_version
  bun_version="$(bun --version)"
  ffmpeg_version="$(ffmpeg -version | head -n 1)"

  if [[ "$UI_LANG" == "zh" ]]; then
    printf '\n%b安装完成！%b\n' "$COLOR_GREEN" "$COLOR_RESET"
    printf '  操作系统：%s\n' "$OS_NAME"
    printf '  Bun：%s\n' "$bun_version"
    printf '  FFmpeg：%s\n' "$ffmpeg_version"
    printf '\n现在可以使用 Fourier：\n'
    printf '  fourier --help\n'
    printf '  fourier-sdk --help\n'
    printf '\n如果新终端中找不到命令，请重新打开终端，或把 %s/bin 加入 PATH。\n' "${BUN_INSTALL:-$HOME/.bun}"
  else
    printf '\n%bInstallation complete!%b\n' "$COLOR_GREEN" "$COLOR_RESET"
    printf '  OS: %s\n' "$OS_NAME"
    printf '  Bun: %s\n' "$bun_version"
    printf '  FFmpeg: %s\n' "$ffmpeg_version"
    printf '\nFourier is ready to use:\n'
    printf '  fourier --help\n'
    printf '  fourier-sdk --help\n'
    printf '\nIf a new terminal cannot find these commands, reopen it or add %s/bin to PATH.\n' "${BUN_INSTALL:-$HOME/.bun}"
  fi
}

main() {
  choose_language
  detect_os

  message \
    "Fourier 一键安装程序将安装 Bun、FFmpeg、Fourier SDK、Render Engine 和 Chromium。" \
    "The Fourier installer will install Bun, FFmpeg, the Fourier SDK, the Render Engine, and Chromium."

  if [[ "$OS_NAME" == "linux" ]]; then
    detect_linux_package_manager
  fi

  ensure_bun_prerequisites
  ensure_bun
  ensure_ffmpeg
  install_fourier_packages
  install_chromium
  print_summary
}

main
