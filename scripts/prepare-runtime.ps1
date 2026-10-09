param(
  [Parameter(Mandatory=$true)][string]$ApkPath,
  [Parameter(Mandatory=$true)][string]$SdkConfigPath,
  [Parameter(Mandatory=$true)][string]$JdkHome,
  [Parameter(Mandatory=$true)][string]$FfmpegPath,
  [string]$MavenCommand = 'mvn',
  [string]$FfmpegNoticesDirectory
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $projectRoot 'native-resources'
if (Test-Path -LiteralPath $runtimeRoot) { throw 'native-resources already exists. Back it up and move it aside before preparing a new runtime.' }
$apkFile = (Resolve-Path -LiteralPath $ApkPath).Path
$configFile = (Resolve-Path -LiteralPath $SdkConfigPath).Path
$ffmpegFile = (Resolve-Path -LiteralPath $FfmpegPath).Path
$jdkFolder = (Resolve-Path -LiteralPath $JdkHome).Path
$jlinkFile = Join-Path $jdkFolder 'bin/jlink.exe'
$javacFile = Join-Path $jdkFolder 'bin/javac.exe'
if (!(Test-Path -LiteralPath $jlinkFile) -or !(Test-Path -LiteralPath $javacFile)) { throw 'A Windows JDK with javac.exe and jlink.exe is required.' }
$config = [IO.File]::ReadAllText($configFile) | ConvertFrom-Json
if ($config -isnot [array] -or $config.Count -lt 17) { throw 'Expected the APK SDK configuration array, not an account or captured request.' }
foreach ($index in @(6,7,8,9,13)) { $config[$index] = '' }
# Windows PowerShell adds ETS properties to ConvertFrom-Json arrays. Rebuild
# the array so ConvertTo-Json writes a JSON array instead of { value, Count }.
$config = @($config | ForEach-Object { $_ })
New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($apkFile)
try {
  foreach ($name in @('libmetasec_ml.so','libEncryptor.so')) {
    $entry = $archive.GetEntry('lib/arm64-v8a/' + $name)
    if (!$entry) { throw ('The supplied APK has no ARM64 library: ' + $name) }
    $inputStream = $entry.Open()
    $outputStream = [IO.File]::Create((Join-Path $runtimeRoot $name))
    try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose(); $inputStream.Dispose() }
  }
} finally { $archive.Dispose() }
[IO.File]::WriteAllText((Join-Path $runtimeRoot 'msconfig.json'),(ConvertTo-Json -InputObject $config -Depth 16 -Compress),(New-Object Text.UTF8Encoding($false)))
$oldJavaHome = $env:JAVA_HOME
try {
  $env:JAVA_HOME = $jdkFolder
  $pomFile = Join-Path $projectRoot 'native-adapter/pom.xml'
  $dependencyFolder = Join-Path $projectRoot 'native-adapter/target/dependencies'
  & $MavenCommand '-q' '-f' $pomFile 'package' '-DskipTests' 'dependency:copy-dependencies' ('-DoutputDirectory=' + $dependencyFolder)
  if ($LASTEXITCODE -ne 0) { throw 'Maven adapter build failed.' }
} finally { $env:JAVA_HOME = $oldJavaHome }
$jarFolder = Join-Path $runtimeRoot 'jars'
New-Item -ItemType Directory -Path $jarFolder | Out-Null
Get-ChildItem -LiteralPath $dependencyFolder -Filter '*.jar' -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $jarFolder }
Copy-Item -LiteralPath (Join-Path $projectRoot 'native-adapter/target/native-signer-research-0.1.0.jar') -Destination (Join-Path $jarFolder 'apk-native-adapter.jar')
& $jlinkFile '--add-modules' 'java.base,java.logging,java.management,java.desktop,java.net.http,jdk.unsupported,jdk.crypto.ec' '--strip-debug' '--no-header-files' '--no-man-pages' '--compress=2' '--output' (Join-Path $runtimeRoot 'jre')
if ($LASTEXITCODE -ne 0) { throw 'jlink runtime creation failed.' }
$mediaFolder = Join-Path $runtimeRoot 'media'
New-Item -ItemType Directory -Path $mediaFolder | Out-Null
Copy-Item -LiteralPath $ffmpegFile -Destination (Join-Path $mediaFolder 'ffmpeg.exe')
if ($FfmpegNoticesDirectory) {
  $noticeFolder = (Resolve-Path -LiteralPath $FfmpegNoticesDirectory).Path
  Copy-Item -LiteralPath $noticeFolder -Destination (Join-Path $mediaFolder 'licenses') -Recurse
}
$buildInfo = & $ffmpegFile '-version' 2>&1
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg cannot run on this Windows host.' }
[IO.File]::WriteAllText((Join-Path $mediaFolder 'BUILDINFO.txt'),($buildInfo -join [Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
$hashes = Get-ChildItem -LiteralPath $runtimeRoot -File -Recurse | ForEach-Object { @{ path=$_.FullName.Substring($runtimeRoot.Length+1).Replace('\','/'); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash; bytes=$_.Length } }
[IO.File]::WriteAllText((Join-Path $runtimeRoot 'local-runtime-manifest.json'),(ConvertTo-Json -InputObject @($hashes) -Depth 8),(New-Object Text.UTF8Encoding($false)))
Write-Output 'Local Windows runtime prepared. This directory is ignored by Git. Do not upload it without separately resolving all third-party distribution requirements.'
