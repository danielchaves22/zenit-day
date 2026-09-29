param([ValidateSet('build','dev')][string]$Mode = 'build', [ValidateSet('aarch64','x86_64')][string]$Target = 'aarch64')
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$androidStudioJdk = 'C:\Program Files\Android\Android Studio\jbr'
if (Test-Path -LiteralPath (Join-Path $androidStudioJdk 'bin\javac.exe')) { $env:JAVA_HOME = $androidStudioJdk }
elseif (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) { throw 'Configure JAVA_HOME para um JDK 17 ou superior.' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not $env:NDK_HOME) { $env:NDK_HOME = Join-Path $env:ANDROID_HOME 'ndk\28.2.13676358' }
if (-not (Test-Path -LiteralPath $env:JAVA_HOME) -or -not (Test-Path -LiteralPath $env:NDK_HOME)) { throw 'Configure JAVA_HOME e NDK_HOME para o JDK e o NDK instalados.' }
$env:CARGO_BUILD_JOBS = '2'
Push-Location -LiteralPath $projectDirectory
try {
    $cli = Join-Path $projectDirectory 'node_modules\.bin\tauri.cmd'
    if ($Mode -eq 'dev') {
        & $cli android dev
        if ($LASTEXITCODE -ne 0) { throw 'O desenvolvimento Android nao iniciou.' }
    } else {
        # Windows PowerShell wraps native stderr as ErrorRecord even for normal Cargo progress.
        # Capture the native exit code and restore strict handling before inspecting the result.
        $previousErrorPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $cli android build --debug --target $Target --apk 2>&1 | ForEach-Object { $_.ToString() } | Tee-Object -Variable buildOutput
            $buildExitCode = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previousErrorPreference }
        if ($buildExitCode -ne 0) {
            # Only fall back after a successful Rust compilation followed by the Windows symlink error.
            if (($buildOutput | Out-String) -notmatch 'Creation symbolic link is not allowed') { throw 'A compilacao Android nao foi concluida.' }
            $triple = if ($Target -eq 'aarch64') { 'aarch64-linux-android' } else { 'x86_64-linux-android' }
            $abi = if ($Target -eq 'aarch64') { 'arm64-v8a' } else { 'x86_64' }
            $arch = if ($Target -eq 'aarch64') { 'arm64' } else { 'x86_64' }
            $library = Join-Path $projectDirectory "src-tauri\target\$triple\debug\libzenit_day_lib.so"
            $jniDirectory = Join-Path $projectDirectory "src-tauri\gen\android\app\src\main\jniLibs\$abi"
            $destination = Join-Path $jniDirectory 'libzenit_day_lib.so'
            New-Item -ItemType Directory -Path $jniDirectory -Force | Out-Null
            if ((Test-Path -LiteralPath $destination) -and ((Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'O destino da biblioteca nao pode ser um link nesta alternativa.' }
            Copy-Item -LiteralPath $library -Destination $destination
            $gradleDirectory = Join-Path $projectDirectory 'src-tauri\gen\android'
            Push-Location -LiteralPath $gradleDirectory
            try {
                & .\gradlew.bat :app:assembleUniversalDebug "-PabiList=$abi" "-ParchList=$arch" "-PtargetList=$Target" -x :app:rustBuildUniversalDebug --no-daemon --max-workers=2 '-Dorg.gradle.jvmargs=-Xmx1024m -Dfile.encoding=UTF-8'
                if ($LASTEXITCODE -ne 0) { throw 'O empacotamento Android nao foi concluido.' }
            } finally { Pop-Location }
        }
    }
} finally { Pop-Location }
