#!/bin/bash
set -euo pipefail
base="$(cd "$(dirname "$0")" && pwd)"
source_app="$base/Hongguo.app"
if [[ "$(uname -s)" != Darwin || ! -d "$source_app/Contents" ]]; then printf '请在 Mac 上解压完整安装包，然后运行此脚本。\n'; exit 1; fi
output="$HOME/Library/Logs/Hongguo/Install-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$output"
phase=source_integrity
finish() {
  local result=$?
  printf 'final_exit=%s\n' "$result" >> "$output/installation.log"
  if [[ "$result" != 0 ]]; then printf '\n准备失败，阶段：%s；退出码：%s。\n日志：%s/installation.log\n可运行随包「诊断Mac启动.command」继续检查。\n' "$phase" "$result" "$output"; fi
}
trap finish EXIT
[[ -f "$base/bundle-SHA256SUMS.txt" && -f "$base/mac-install-lib.sh" ]]
(cd "$base" && /usr/bin/shasum -a 256 -c bundle-SHA256SUMS.txt) > "$output/integrity-check.txt" 2>&1
while IFS=$'\t' read -r link target; do
  [[ -n "$link" ]] || continue
  [[ -L "$base/$link" && "$(/usr/bin/readlink "$base/$link")" == "$target" ]]
done < "$base/bundle-symlinks.txt"
source "$base/mac-install-lib.sh"
log_value format hongguo-mac-install-v2
log_value source_integrity passed
version="$(/usr/bin/plutil -extract CFBundleVersion raw "$source_app/Contents/Info.plist")"
log_value bundle_version "$version"
log_value macos_version "$(/usr/bin/sw_vers -productVersion)"
expected="$(/usr/bin/plutil -extract HongguoArchitecture raw "$source_app/Contents/Info.plist")"
host="$(uname -m)"
if [[ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" == 1 ]]; then host=arm64; fi
log_value host_arch "$host"
if [[ "$host" != arm64 || "$expected" != arm64 ]]; then printf '请使用 Apple Silicon Mac 与 ARM64 安装包。\n'; exit 1; fi
applications="$HOME/Applications"
mkdir -p "$applications"
stage="$(mktemp -d "$applications/.Hongguo-install.XXXXXX")"
candidate="$stage/Hongguo.app"
case "$candidate" in "$applications"/.Hongguo-install.*/Hongguo.app) ;; *) exit 1 ;; esac
if has_quarantine "$source_app"; then log_value source_quarantine yes; else log_value source_quarantine no; fi
phase=stage_copy
/usr/bin/ditto --noqtn "$source_app" "$candidate"
# Only this checked, newly created app copy; all other attributes/locations stay intact.
/usr/bin/xattr -dr com.apple.quarantine "$candidate" >/dev/null 2>&1 || true
if has_quarantine "$candidate"; then log_value staged_quarantine still_present; exit 1; fi
log_value staged_quarantine no
decoder="$candidate/Contents/Resources/apk-native/media/ffmpeg"
[[ -f "$decoder" && ! -L "$decoder" ]]
/bin/chmod u+x "$decoder"
decoder_sha_before="$(/usr/bin/shasum -a 256 "$decoder" | /usr/bin/awk '{print $1}')"
# Preserve FFmpeg's valid upstream signature. Never ad-hoc re-sign it.
run_checked decoder_vendor_signature /usr/bin/codesign --verify --strict "$decoder"
if has_quarantine "$decoder"; then log_value decoder_quarantine still_present; exit 1; fi
log_value decoder_quarantine no
run_checked decoder_launch "$decoder" -hide_banner -version
run_checked decoder_encode "$decoder" -hide_banner -v error -f lavfi -i 'testsrc2=size=320x180:rate=24' -f lavfi -i 'sine=frequency=440:sample_rate=44100' -t 1 -c:v libx264 -pix_fmt yuv420p -c:a aac -f null -
run_checked entitlements_format /usr/bin/plutil -convert xml1 -o "$stage/entitlements.plist" "$base/entitlements.mac.plist"
phase=nested_signing
while IFS= read -r -d '' item; do
  [[ "$item" == "$decoder" ]] && continue
  if /usr/bin/file -b "$item" | /usr/bin/grep -q 'Mach-O'; then sign_leaf_if_needed "$item"; fi
done < <(/usr/bin/find "$candidate/Contents" -type f -print0)
for framework in "$candidate"/Contents/Frameworks/*.framework; do
  [[ -d "$framework" ]] || continue
  if ! /usr/bin/codesign --verify --strict "$framework" >/dev/null 2>&1; then sign_bundle "$framework"; fi
done
for helper in "$candidate"/Contents/Frameworks/*.app; do [[ -d "$helper" ]] && sign_bundle "$helper"; done
sign_bundle "$candidate"
run_checked app_signature /usr/bin/codesign --verify --deep --strict "$candidate"
decoder_sha_after="$(/usr/bin/shasum -a 256 "$decoder" | /usr/bin/awk '{print $1}')"
[[ "$decoder_sha_before" == "$decoder_sha_after" ]]
log_value decoder_vendor_bytes preserved
run_checked java_launch "$candidate/Contents/Resources/apk-native/jre/bin/java" -version
mkdir -p "$output/media"
export HONGGUO_MEDIA_QA_OUTPUT="$output/media"
run_checked chromium_video "$candidate/Contents/MacOS/Hongguo" --media-self-test
destination="$applications/Hongguo.app"
phase=existing_installation
if [[ -e "$destination" ]]; then
  if /usr/bin/pgrep -f "$destination/Contents/MacOS/" >/dev/null; then printf '请先手动退出旧红果，再运行准备脚本。\n'; exit 1; fi
  stamp="$(date +%Y%m%d-%H%M%S)"
  backup="$applications/Hongguo-backups/$stamp-$$"
  mkdir -p "$backup"
  /usr/bin/ditto "$destination" "$backup/Hongguo.app"
  /usr/bin/find "$backup/Hongguo.app" -type f -exec /usr/bin/shasum -a 256 {} \; > "$backup/SHA256SUMS.txt"
  previous_version="$(/usr/bin/plutil -extract CFBundleVersion raw "$backup/Hongguo.app/Contents/Info.plist")"
  printf 'scope=previous installed Mac application\nversion=%s\n' "$previous_version" > "$backup/manifest.txt"
  [[ -s "$backup/SHA256SUMS.txt" && -f "$backup/Hongguo.app/Contents/Info.plist" ]]
  /bin/mv "$destination" "$backup/previous-installation.app"
fi
phase=install
if ! /bin/mv "$candidate" "$destination"; then
  if [[ -n "${backup:-}" && -d "$backup/previous-installation.app" && ! -e "$destination" ]]; then /bin/mv "$backup/previous-installation.app" "$destination"; fi
  exit 1
fi
log_value installed yes
printf '\n准备及隐藏视频自检通过，已安装到 %s\n请打开此处的 Hongguo.app，不要打开 Downloads 中的源应用。\n日志：%s/installation.log\n此为本机 ad-hoc 签名，不是 Apple 公证发行版。\n' "$destination" "$output"
