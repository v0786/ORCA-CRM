param(
  [string]$KeyFile = "",
  [string]$ProjectId = ""
)

$ErrorActionPreference = "Stop"

function LoadDotEnv($path) {
  if (!(Test-Path $path)) { return }
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (!$line) { return }
    if ($line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $k = $line.Substring(0, $idx).Trim()
    $v = $line.Substring($idx + 1).Trim()
    if ($k -and $v) { Set-Item -Path "Env:$k" -Value $v }
  }
}

LoadDotEnv (Join-Path $PSScriptRoot "..\.env.gcp")

if ($KeyFile) {
  $env:GOOGLE_APPLICATION_CREDENTIALS = $KeyFile
}

if (!$env:GOOGLE_APPLICATION_CREDENTIALS) {
  throw "GOOGLE_APPLICATION_CREDENTIALS is not set. Set it or create .env.gcp with the path."
}

if (!(Test-Path $env:GOOGLE_APPLICATION_CREDENTIALS)) {
  throw "Key file not found at: $env:GOOGLE_APPLICATION_CREDENTIALS"
}

$keyJson = Get-Content $env:GOOGLE_APPLICATION_CREDENTIALS -Raw | ConvertFrom-Json
$required = @(
  "type",
  "project_id",
  "private_key_id",
  "private_key",
  "client_email",
  "client_id",
  "auth_uri",
  "token_uri",
  "auth_provider_x509_cert_url",
  "client_x509_cert_url"
)

foreach ($k in $required) {
  if (-not ($keyJson.PSObject.Properties.Name -contains $k)) {
    throw "Service account key missing field: $k"
  }
}

if (!$ProjectId) { $ProjectId = [string]$keyJson.project_id }

function FindGcloud() {
  $cmd = Get-Command gcloud -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"),
    "C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
  )

  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }

  return ""
}

$gcloud = FindGcloud
if (!$gcloud) {
  throw "gcloud CLI not found. Install Google Cloud SDK and try again."
}

& $gcloud --version | Out-Null

& $gcloud auth activate-service-account --key-file="$env:GOOGLE_APPLICATION_CREDENTIALS" | Out-Null

$accountsJson = & $gcloud auth list --format=json | ConvertFrom-Json
$active = $accountsJson | Where-Object { $_.status -eq "ACTIVE" }
if (!$active) {
  throw "No ACTIVE account found in `gcloud auth list`."
}

$token = (& $gcloud auth print-access-token).Trim()
if (!$token) { throw "Failed to obtain access token from gcloud." }

$uri = "https://storage.googleapis.com/storage/v1/b?project=$ProjectId"
$resp = Invoke-WebRequest -Method GET -Uri $uri -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing

if ($resp.StatusCode -ne 200) {
  throw "Expected 200 OK from Storage API, got $($resp.StatusCode)"
}

$body = $resp.Content | ConvertFrom-Json
"OK: Service account is active and Storage API returned 200. Buckets returned: $($body.items.Count)"
