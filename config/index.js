module.exports = {
  uin: 843476168,
  password: 'zx2962MmZy',
  DataBaseUrl: 'mongodb://localhost:27017/oicq',
  device: {
    // "--begin--": "修改后可能需要重新验证设备。",
    "product": "iarim",
    "device": "gemini",
    "board": "eomam",
    "brand": "Xiaomi",
    "model": "MI 5",
    "wifi_ssid": "TP-${rand(10).toString(16)}",
    "bootloader": "U-boot",
    // "--end--": "下面的请勿随意修改，除非你知道你在做什么。",
    "android_id": "BRAND.${rand(6)}.${rand(3)}",
    "boot_id": "${uuid()}",
    "proc_version": "Linux version 3.18.31-perf-ga81b099 (builder@c3-miui-ota-bd25.bj)",
    "mac_address": "b0:e2:35:c1:c7:f6",
    "ip_address": "10.0.${rand(2)}.${rand(2)}",
    "imei": "${genIMEI()}",
    "incremental": "${rand(7)}"
  }
}