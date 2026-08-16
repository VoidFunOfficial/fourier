[CmdletBinding()]
param(
    [ValidateSet("zh", "en")]
    [string]$Lang = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:UiLang = ""

function Select-Language {
    if ($Lang) {
        $script:UiLang = $Lang
        return
    }

    $environmentLanguage = $env:FOURIER_INSTALL_LANG
    if ($environmentLanguage) {
        switch ($environmentLanguage.Trim().ToLowerInvariant()) {
            { $_ -in @("zh", "zh-cn", "cn", "1") } {
                $script:UiLang = "zh"
                return
            }
            { $_ -in @("en", "en-us", "2") } {
                $script:UiLang = "en"
                return
            }
            default {
                throw "FOURIER_INSTALL_LANG must be zh or en / FOURIER_INSTALL_LANG 必须是 zh 或 en。"
            }
        }
    }

    Write-Host "请选择语言 / Choose a language:"
    Write-Host "  1) 中文"
    Write-Host "  2) English"
    $selection = Read-Host ">"
    if ($selection -match "^(2|en|english)$") {
        $script:UiLang = "en"
    }
    else {
        $script:UiLang = "zh"
    }
}

function Get-Text {
    param(
        [Parameter(Mandatory = $true)][string]$Zh,
        [Parameter(Mandatory = $true)][string]$En
    )

    if ($script:UiLang -eq "zh") { return $Zh }
    return $En
}

function Write-Step {
    param([string]$Zh, [string]$En)
    Write-Host "`n==> $(Get-Text -Zh $Zh -En $En)" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Zh, [string]$En)
    Write-Host "[OK] $(Get-Text -Zh $Zh -En $En)" -ForegroundColor Green
}

function Stop-Installation {
    param([string]$Zh, [string]$En)
    throw (Get-Text -Zh $Zh -En $En)
}

function Test-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Add-CurrentProcessPath {
    param([Parameter(Mandatory = $true)][string]$Directory)

    if (-not (Test-Path -LiteralPath $Directory)) { return }
    $pathParts = @($env:Path -split ";")
    if ($pathParts -notcontains $Directory) {
        $env:Path = "$Directory;$env:Path"
    }
}

function Refresh-ProcessPath {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $env:Path = @($userPath, $machinePath) -join ";"

    $bunRoot = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $env:USERPROFILE ".bun" }
    Add-CurrentProcessPath -Directory (Join-Path $bunRoot "bin")

    if ($env:LOCALAPPDATA) {
        Add-CurrentProcessPath -Directory (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links")
    }
}

function Assert-LastExitCode {
    param([string]$Zh, [string]$En)
    if ($LASTEXITCODE -ne 0) {
        Stop-Installation -Zh $Zh -En $En
    }
}

function Install-Bun {
    Write-Step -Zh "检查 Bun" -En "Checking Bun"
    Refresh-ProcessPath
    if (Test-Command -Name "bun") {
        Write-Success -Zh "已检测到 Bun：$(& bun --version)" -En "Bun is already available: $(& bun --version)"
        return
    }

    Write-Host (Get-Text `
        -Zh "即将通过 Bun 官方 PowerShell 安装脚本安装。" `
        -En "Bun will be installed with its official PowerShell installer.")
    Invoke-RestMethod "https://bun.sh/install.ps1" | Invoke-Expression
    Refresh-ProcessPath

    if (-not (Test-Command -Name "bun")) {
        Stop-Installation `
            -Zh "Bun 安装完成，但当前 PowerShell 找不到 bun。请重新打开终端后重试。" `
            -En "Bun finished installing, but bun is unavailable. Reopen PowerShell and retry."
    }
    Write-Success -Zh "Bun 安装完成：$(& bun --version)" -En "Bun installed: $(& bun --version)"
}

function Install-FFmpeg {
    Write-Step -Zh "检查 FFmpeg 和 ffprobe" -En "Checking FFmpeg and ffprobe"
    Refresh-ProcessPath
    if ((Test-Command -Name "ffmpeg") -and (Test-Command -Name "ffprobe")) {
        Write-Success -Zh "FFmpeg 和 ffprobe 已安装。" -En "FFmpeg and ffprobe are already installed."
        return
    }

    if (-not (Test-Command -Name "winget")) {
        Stop-Installation `
            -Zh "没有找到 winget。请从 Microsoft Store 安装或更新“应用安装程序”，然后重试。" `
            -En "winget was not found. Install or update App Installer from Microsoft Store, then retry."
    }

    Write-Step -Zh "使用 winget 安装 FFmpeg" -En "Installing FFmpeg with winget"
    & winget install --id Gyan.FFmpeg --exact --source winget --silent --accept-source-agreements --accept-package-agreements
    Assert-LastExitCode `
        -Zh "winget 安装 FFmpeg 失败。请查看上方输出。" `
        -En "winget failed to install FFmpeg. Review the output above."
    Refresh-ProcessPath

    if (-not ((Test-Command -Name "ffmpeg") -and (Test-Command -Name "ffprobe"))) {
        Stop-Installation `
            -Zh "FFmpeg 已由 winget 安装，但当前 PowerShell 尚未读取到新 PATH。请重新打开 PowerShell 后再次运行脚本。" `
            -En "winget installed FFmpeg, but this PowerShell session cannot see the new PATH. Reopen PowerShell and run the script again."
    }
    Write-Success -Zh "FFmpeg 安装完成。" -En "FFmpeg installed."
}

function Install-FourierPackages {
    Write-Step -Zh "全局安装 Fourier SDK 和 Render Engine" -En "Installing the Fourier SDK and Render Engine globally"
    & bun add --global "@fourier-video/sdk" "@fourier-video/render-engine"
    Assert-LastExitCode `
        -Zh "Fourier 全局包安装失败。请查看上方输出。" `
        -En "The global Fourier package installation failed. Review the output above."
    Write-Success `
        -Zh "已全局安装 @fourier-video/sdk 和 @fourier-video/render-engine。" `
        -En "Installed @fourier-video/sdk and @fourier-video/render-engine globally."
}

function Install-Chromium {
    Write-Step -Zh "安装 Chromium 及其系统依赖" -En "Installing Chromium and its system dependencies"
    & bunx playwright install --with-deps chromium
    Assert-LastExitCode `
        -Zh "Chromium 安装失败。请查看上方输出。" `
        -En "Chromium installation failed. Review the output above."
    Write-Success -Zh "Chromium 安装完成。" -En "Chromium installed."
}

function Show-Summary {
    $bunVersion = & bun --version
    $ffmpegVersion = (& ffmpeg -version | Select-Object -First 1)

    Write-Host ""
    Write-Host (Get-Text -Zh "安装完成！" -En "Installation complete!") -ForegroundColor Green
    Write-Host "  Bun: $bunVersion"
    Write-Host "  FFmpeg: $ffmpegVersion"
    Write-Host ""
    Write-Host (Get-Text -Zh "现在可以使用：" -En "Fourier is ready to use:")
    Write-Host "  fourier --help"
    Write-Host "  fourier-sdk --help"
    Write-Host ""
    Write-Host (Get-Text `
        -Zh "如果新终端中找不到命令，请关闭并重新打开 PowerShell。" `
        -En "If a new terminal cannot find the commands, close and reopen PowerShell.")
}

function Main {
    Select-Language
    Write-Host (Get-Text `
        -Zh "Fourier Windows 一键安装程序将安装 Bun、FFmpeg、Fourier SDK、Render Engine 和 Chromium。" `
        -En "The Fourier Windows installer will install Bun, FFmpeg, the Fourier SDK, the Render Engine, and Chromium.")

    Install-Bun
    Install-FFmpeg
    Install-FourierPackages
    Install-Chromium
    Show-Summary
}

try {
    Main
}
catch {
    Write-Host ""
    Write-Host "$(Get-Text -Zh '错误' -En 'Error'): $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
