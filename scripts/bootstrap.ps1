$ErrorActionPreference = "Stop"

Write-Host "Installing Node workspace dependencies..."
pnpm install

Write-Host "Syncing Python engine dependencies..."
Push-Location engine
uv sync
Pop-Location

Write-Host "Bootstrap complete."
