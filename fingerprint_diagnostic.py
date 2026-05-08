#!/usr/bin/env python3
"""
🔧 Fingerprint Sensor Diagnostic Test
This script tests the fingerprint sensor configuration and shows detailed debugging info
"""

import os
import json
import subprocess
import sys

print("=" * 80)
print("🔧 FINGERPRINT SENSOR DIAGNOSTIC TEST")
print("=" * 80)
print()

# Test 1: Check if APK is installed
print("Test 1: APK Installation Status")
print("-" * 80)

try:
    result = subprocess.run(
        ["adb", "shell", "pm", "list", "packages", "-3"],
        capture_output=True,
        text=True,
        timeout=5
    )
    
    packages = result.stdout.split('\n')
    biovault_found = any('biovault' in p.lower() or 'pinit' in p.lower() for p in packages)
    
    if biovault_found:
        print("✅ BioVault/PINIT app is INSTALLED on device")
        app_package = [p for p in packages if 'biovault' in p.lower() or 'pinit' in p.lower()][0]
        print(f"   Package: {app_package}")
    else:
        print("❌ BioVault/PINIT app is NOT installed")
        print("   Install with: adb install -r app.apk")
        sys.exit(1)
except Exception as e:
    print(f"❌ Error checking app installation: {e}")
    sys.exit(1)

print()

# Test 2: Check if fingerprint is enrolled
print("Test 2: Device Fingerprint Enrollment")
print("-" * 80)

try:
    result = subprocess.run(
        ["adb", "shell", "getprop", "ro.hardware.fingerprint"],
        capture_output=True,
        text=True,
        timeout=5
    )
    
    fingerprint_hw = result.stdout.strip()
    
    if fingerprint_hw:
        print(f"✅ Device has fingerprint hardware: {fingerprint_hw}")
    else:
        print("⚠️  Device may not have fingerprint hardware")
    
    # Check if fingerprint is enrolled
    result = subprocess.run(
        ["adb", "shell", "settings", "get", "secure", "lock_pattern_visible_pattern"],
        capture_output=True,
        text=True,
        timeout=5
    )
    
    print()
    print("   To check enrolled fingerprints on device:")
    print("   1. Go to Settings → Biometrics & Security → Fingerprints")
    print("   2. Verify at least one fingerprint is registered")
    
except Exception as e:
    print(f"⚠️  Could not check fingerprint enrollment: {e}")

print()

# Test 3: Check Android permissions
print("Test 3: App Permissions")
print("-" * 80)

try:
    perms_to_check = [
        "android.permission.USE_BIOMETRIC",
        "android.permission.USE_FINGERPRINT",
        "android.permission.CAMERA"
    ]
    
    for perm in perms_to_check:
        result = subprocess.run(
            ["adb", "shell", "pm", "dump", "com.biovault.app"],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if perm in result.stdout:
            print(f"✅ Permission granted: {perm}")
        else:
            print(f"⚠️  Permission status unknown: {perm}")
            print(f"    Grant with: adb shell pm grant com.biovault.app {perm}")
    
except Exception as e:
    print(f"⚠️  Could not check permissions: {e}")

print()

# Test 4: Check Cordova plugin
print("Test 4: Cordova Plugin Status")
print("-" * 80)

print("Expected plugins in app:")
print("  ✓ cordova-plugin-fingerprint-aio")
print("  ✓ cordova-plugin-android-permissions")
print("  ✓ cordova-plugin-x-socialsharing")
print()

plugins_file = "plugins/ios.json"
if os.path.exists(plugins_file):
    try:
        with open(plugins_file, 'r') as f:
            plugins_data = json.load(f)
        
        if "cordova-plugin-fingerprint-aio" in plugins_data:
            print("✅ cordova-plugin-fingerprint-aio is INSTALLED")
        else:
            print("❌ cordova-plugin-fingerprint-aio is NOT installed")
            print("   Install with: cordova plugin add cordova-plugin-fingerprint-aio")
    except Exception as e:
        print(f"⚠️  Could not read plugins.json: {e}")
else:
    print("⚠️  plugins.json not found in expected location")

print()

# Test 5: Check Capacitor config
print("Test 5: Capacitor Configuration")
print("-" * 80)

try:
    with open("capacitor.config.ts", 'r') as f:
        config_content = f.read()
    
    if "BiometricAuth" in config_content:
        print("✅ BiometricAuth plugin is configured in capacitor.config.ts")
    else:
        print("⚠️  BiometricAuth plugin not found in capacitor.config.ts")
        print("   Add to capacitor.config.ts:")
        print("   plugins: {")
        print("     BiometricAuth: {},")
        print("   }")
except Exception as e:
    print(f"⚠️  Could not read capacitor.config.ts: {e}")

print()

# Test 6: Logcat check
print("Test 6: Real-time Device Log (Logcat)")
print("-" * 80)
print()
print("To debug fingerprint sensor activation in real-time:")
print()
print("  1. Open two terminals")
print()
print("  2. Terminal 1 - Start logcat:")
print("     adb logcat | grep -i 'fingerprint\\|biometric\\|auth'")
print()
print("  3. Terminal 2 - Tap verify fingerprint in app:")
print("     adb shell input tap 500 400  (or click manually on device)")
print()
print("  4. Check Terminal 1 for sensor activation logs")
print()

# Run live logcat
print("Starting live logcat (Ctrl+C to stop):")
print("-" * 80)

try:
    subprocess.run(
        ["adb", "logcat", "-s", "Fingerprint,BiometricAuth,FingerprintAuth"],
        timeout=10
    )
except KeyboardInterrupt:
    print("\n\nLogcat stopped by user")
except Exception as e:
    print(f"Could not start logcat: {e}")

print()
print("=" * 80)
print("DIAGNOSTIC SUMMARY")
print("=" * 80)
print()
print("✅ Check list for fingerprint sensor activation:")
print("  [ ] Device has fingerprint hardware")
print("  [ ] At least one fingerprint enrolled in device settings")
print("  [ ] App has USE_BIOMETRIC permission granted")
print("  [ ] cordova-plugin-fingerprint-aio is installed")
print("  [ ] BiometricAuth is configured in capacitor.config.ts")
print("  [ ] APK rebuilt after plugin installation")
print("  [ ] App restarted after permission grant")
print()
print("📝 If sensor still doesn't activate:")
print("  1. Check logcat for specific error messages")
print("  2. Ensure fingerprint is enrolled: Settings → Biometrics → Fingerprints")
print("  3. Try restarting the app completely")
print("  4. Check that device supports fingerprint (not all devices do)")
print("  5. Try a different finger")
print("=" * 80)
