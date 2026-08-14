<#
.SYNOPSIS
Put Slate on the Desktop and in the Start Menu so it launches like any other app.

.DESCRIPTION
Creates shortcuts pointing at the built executable. Nothing is installed and
nothing is registered - remove the shortcuts to undo. Run with -Remove to
delete them again.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $projectRoot 'src-tauri\target\release\slate.exe'

$targets = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Slate.lnk'),
    (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Slate.lnk')
)

if ($Remove) {
    foreach ($path in $targets) {
        if (Test-Path $path) {
            Remove-Item $path -Force
            Write-Host "Removed $path"
        }
    }
    return
}

if (-not (Test-Path $exe)) {
    throw "Slate has not been built yet. Run 'npm run build:app' in $projectRoot first."
}

$shell = New-Object -ComObject WScript.Shell
foreach ($path in $targets) {
    $parent = Split-Path -Parent $path
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    if ($PSCmdlet.ShouldProcess($path, 'Create shortcut')) {
        $link = $shell.CreateShortcut($path)
        $link.TargetPath = $exe
        $link.WorkingDirectory = Split-Path -Parent $exe
        $link.IconLocation = $exe
        $link.Description = 'Personal release calendar'
        $link.Save()
        Write-Host "Created $path"
    }
}

Write-Host ''
Write-Host 'Slate is on your Desktop and in the Start Menu.'
Write-Host 'Search "Slate" in the Start Menu, then right-click to pin it to the taskbar.'
