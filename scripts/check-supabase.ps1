$ErrorActionPreference = 'Stop'
$nodeScript = Join-Path $PSScriptRoot 'check-supabase.mjs'
& node $nodeScript --config-only
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$loginEmail = Read-Host 'E-mail da conta do Zenit Day (Authentication > Users)'
$securePassword = Read-Host 'Senha dessa conta' -AsSecureString
$passwordPointer = [IntPtr]::Zero
$savedOutputEncoding = $OutputEncoding
$savedConsoleEncoding = [Console]::OutputEncoding
try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $loginPayload = @{
        email = $loginEmail
        password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    }
    $OutputEncoding = New-Object System.Text.UTF8Encoding $false
    [Console]::OutputEncoding = $OutputEncoding
    $loginPayload | ConvertTo-Json -Compress | & node $nodeScript
    $verificationExitCode = $LASTEXITCODE
} finally {
    if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    if ($null -ne $loginPayload) { $loginPayload.password = $null }
    $securePassword.Dispose()
    $OutputEncoding = $savedOutputEncoding
    [Console]::OutputEncoding = $savedConsoleEncoding
}
exit $verificationExitCode

