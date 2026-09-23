# Recovery/setup helper for the same personal Desktop OAuth client used by Slate.
# Tokens are never printed; the resulting account file uses Windows DPAPI.
param([switch]$BrowserAutomation)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.Web
$slateAccountPath = Join-Path $env:APPDATA 'com.slate.app\google-account.bin'
$slatePlain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($slateAccountPath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
$slateAccount = [Text.Encoding]::UTF8.GetString($slatePlain) | ConvertFrom-Json
function New-SlateNonce {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
$slateVerifier = New-SlateNonce
$slateState = New-SlateNonce
$slateHash = [Security.Cryptography.SHA256]::Create()
try { $slateChallenge = [Convert]::ToBase64String($slateHash.ComputeHash([Text.Encoding]::ASCII.GetBytes($slateVerifier))).TrimEnd('=').Replace('+', '-').Replace('/', '_') } finally { $slateHash.Dispose() }
$slateListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$slateListener.Start()
$slateRedirect = 'http://127.0.0.1:' + $slateListener.LocalEndpoint.Port + '/'
$slateQuery = [ordered]@{client_id=$slateAccount.clientId;redirect_uri=$slateRedirect;response_type='code';scope='https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';state=$slateState;code_challenge=$slateChallenge;code_challenge_method='S256';access_type='offline';prompt='consent select_account'}
$slateQueryText = ($slateQuery.GetEnumerator() | ForEach-Object { [Uri]::EscapeDataString($_.Key) + '=' + [Uri]::EscapeDataString($_.Value) }) -join '&'
$slateAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + $slateQueryText
if ($BrowserAutomation) { Write-Output ('Authorization URL: ' + $slateAuthUrl) }
else { Start-Process -FilePath $slateAuthUrl }
Write-Output 'Google sign-in opened for Slate. Waiting for browser consent (up to five minutes).'
$slateDeadline = [DateTime]::UtcNow.AddMinutes(5)
$slateCode = $null
try {
    while ([DateTime]::UtcNow -lt $slateDeadline -and -not $slateCode) {
        if (-not $slateListener.Pending()) { Start-Sleep -Milliseconds 200; continue }
        $slateSocket = $slateListener.AcceptTcpClient()
        try {
            $slateStream = $slateSocket.GetStream()
            $slateStream.ReadTimeout = 3000
            $slateBuffer = New-Object byte[] 16384
            $slateLength = $slateStream.Read($slateBuffer, 0, $slateBuffer.Length)
            $slateRequest = [Text.Encoding]::ASCII.GetString($slateBuffer, 0, $slateLength)
            $slateTarget = ($slateRequest -split ' ')[1]
            $slateCallback = [Uri]('http://127.0.0.1' + $slateTarget)
            $slateParameters = [Web.HttpUtility]::ParseQueryString($slateCallback.Query)
            $slateValid = $slateCallback.AbsolutePath -eq '/' -and $slateParameters['state'] -ceq $slateState
            $slateBody = if ($slateValid) { '<!doctype html><title>Slate</title><h1>Return to Slate</h1><p>The Google connection is being saved. You can close this tab.</p>' } else { 'Not found' }
            $slateReply = 'HTTP/1.1 ' + $(if ($slateValid) {'200 OK'} else {'404 Not Found'}) + "`r`nContent-Type: text/html`r`nCache-Control: no-store`r`nConnection: close`r`nContent-Length: " + [Text.Encoding]::UTF8.GetByteCount($slateBody) + "`r`n`r`n" + $slateBody
            $slateReplyBytes = [Text.Encoding]::UTF8.GetBytes($slateReply)
            $slateStream.Write($slateReplyBytes, 0, $slateReplyBytes.Length)
            if ($slateValid) {
                if ($slateParameters['error']) { throw 'Google access was declined. No tokens were saved.' }
                $slateCode = $slateParameters['code']
            }
        } finally { $slateSocket.Dispose() }
    }
} finally { $slateListener.Stop() }
if (-not $slateCode) { throw 'Google sign-in timed out. No tokens were saved.' }
$slateToken = Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' -Body @{client_id=$slateAccount.clientId;client_secret=$slateAccount.clientSecret;code=$slateCode;code_verifier=$slateVerifier;redirect_uri=$slateRedirect;grant_type='authorization_code'} -TimeoutSec 30
if (-not $slateToken.refresh_token -or -not $slateToken.access_token) { throw 'Google did not grant offline calendar access.' }
$slateScopeList = $slateToken.scope -split ' '
if ($slateScopeList -notcontains 'https://www.googleapis.com/auth/calendar.events' -or $slateScopeList -notcontains 'https://www.googleapis.com/auth/calendar.calendarlist.readonly') { throw 'Both Calendar permissions are required. No connection was saved.' }
$slateCalendar = Invoke-RestMethod -Uri 'https://www.googleapis.com/calendar/v3/users/me/calendarList/primary' -Headers @{Authorization=('Bearer ' + $slateToken.access_token)} -TimeoutSec 30
if ($slateCalendar.accessRole -notin @('owner','writer')) { throw 'Your primary calendar is not writable.' }
$slateAccount.accessToken = $slateToken.access_token
$slateAccount.refreshToken = $slateToken.refresh_token
$slateAccount.expiresAt = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + $slateToken.expires_in
$slateAccount.calendarId = $slateCalendar.id
$slateAccount.calendarName = $slateCalendar.summary
$slateAccount.enabled = $true
$slateAccount.mode = 'push'
$slateEncrypted = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes(($slateAccount | ConvertTo-Json -Compress)), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($slateAccountPath, $slateEncrypted)
Write-Output 'Connected. One-way sync to your primary Google calendar is enabled. Slate will pick it up automatically within two minutes.'
