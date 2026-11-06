# send-key.ps1 — Send a virtual keypress globally
param(
  [string]$Key = "F8"
)

Add-Type -AssemblyName System.Windows.Forms

$keyMap = @{
  "F7"  = [System.Windows.Forms.Keys]::F7
  "F8"  = [System.Windows.Forms.Keys]::F8
  "F9"  = [System.Windows.Forms.Keys]::F9
  "F10" = [System.Windows.Forms.Keys]::F10
}

if (-not $keyMap.ContainsKey($Key)) {
  Write-Error "Unknown key: $Key"
  exit 1
}

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KeySender {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    public static void SendKey(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);           // keydown
        System.Threading.Thread.Sleep(50);
        keybd_event(vk, 0, 0x0002, UIntPtr.Zero);      // keyup
    }
}
"@

$vk = [byte][System.Windows.Forms.Keys]($keyMap[$Key])
[KeySender]::SendKey($vk)
Write-Host "[SendKey] Sent $Key (VK=$vk)"
