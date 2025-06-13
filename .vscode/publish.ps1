# sign.ps1

# Load env variables
Get-Content "./.env" |
  Where-Object { ($_ -match '=') -and (-not $_.StartsWith('#')) } |
  ForEach-Object {
    $parts = $_ -split '=', 2
    [System.Environment]::SetEnvironmentVariable($parts[0], $parts[1], 'Process')
  }

# Call web-ext to sign and publish
npx web-ext sign `
  --channel=listed `
  --api-key=$env:AMO_JWT_ISSUER `
  --api-secret=$env:AMO_JWT_SECRET