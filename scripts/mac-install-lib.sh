#!/bin/bash
# Absolute tools; only the installer's checked staged copy is modified.
log_value() { printf '%s=%s\n' "$1" "$2" >> "$output/installation.log"; }
has_quarantine() { /usr/bin/xattr -p com.apple.quarantine "$1" >/dev/null 2>&1; }
run_checked() {
  phase="$1"; shift
  if "$@" > "$output/last-tool.txt" 2>&1; then log_value "$phase" passed;
  else local result=$?; log_value "$phase" failed; log_value exit_code "$result"; return "$result"; fi
}
fresh_inode() {
  local item="$1" replacement previous current
  previous="$(/usr/bin/stat -f %i "$item")"
  replacement="$(/usr/bin/mktemp "$(dirname "$item")/.Hongguo-code.XXXXXX")"
  /usr/bin/ditto --noqtn "$item" "$replacement"
  /bin/mv -f "$replacement" "$item"
  current="$(/usr/bin/stat -f %i "$item")"
  [[ "$previous" != "$current" ]]
}
sign_leaf_if_needed() {
  local item="$1"
  if /usr/bin/codesign --verify --strict "$item" >/dev/null 2>&1; then return 0; fi
  run_checked leaf_sign /usr/bin/codesign --force --sign - --options 0 --timestamp=none "$item"
  fresh_inode "$item"
  run_checked leaf_verify /usr/bin/codesign --verify --strict "$item"
}
sign_bundle() {
  local bundle="$1" plist executable target physical_root
  physical_root="$(cd "$candidate" && pwd -P)"
  if [[ "$bundle" == *.framework ]]; then
    plist="$bundle/Resources/Info.plist"
    executable="$(/usr/bin/plutil -extract CFBundleExecutable raw "$plist")"
    target="$(cd "$bundle/Versions/Current" && pwd -P)/$executable"
    run_checked framework_sign /usr/bin/codesign --force --sign - --options 0 --timestamp=none "$bundle"
  else
    plist="$bundle/Contents/Info.plist"
    executable="$(/usr/bin/plutil -extract CFBundleExecutable raw "$plist")"
    target="$(cd "$bundle/Contents/MacOS" && pwd -P)/$executable"
    run_checked bundle_sign /usr/bin/codesign --force --sign - --options 0 --timestamp=none --generate-entitlement-der --entitlements "$stage/entitlements.plist" "$bundle"
  fi
  [[ -f "$target" && ! -L "$target" ]]
  case "$target" in "$physical_root"/*) ;; *) return 1 ;; esac
  fresh_inode "$target"
  run_checked bundle_verify /usr/bin/codesign --verify --strict "$bundle"
}
