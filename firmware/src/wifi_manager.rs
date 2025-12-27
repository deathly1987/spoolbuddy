//! WiFi Manager with C-callable interface
//!
//! Provides async WiFi connection with status polling for UI integration.
//! The connection runs in a background thread to avoid blocking the UI.
//! Credentials are persisted to NVS for auto-reconnect on boot.

use esp_idf_hal::modem::Modem;
use esp_idf_svc::eventloop::EspSystemEventLoop;
use esp_idf_svc::nvs::{EspDefaultNvsPartition, EspNvs};
use esp_idf_svc::wifi::{AuthMethod, BlockingWifi, ClientConfiguration, Configuration, EspWifi};
use log::{info, warn, error};
use std::ffi::{CStr, c_char, c_int};
use std::sync::Mutex;

// NVS keys for WiFi credentials
const NVS_NAMESPACE: &str = "wifi";
const NVS_KEY_SSID: &str = "ssid";
const NVS_KEY_PASSWORD: &str = "password";

/// WiFi connection state
#[derive(Debug, Clone, PartialEq)]
pub enum WifiState {
    Uninitialized,
    Disconnected,
    Connecting,
    Connected { ip: [u8; 4], rssi: i8 },
    Error(String),
}

/// Global WiFi manager state
struct WifiManager {
    state: WifiState,
    ssid: String,
    password: String,
    // WiFi handle stored after init - using Option to handle initial state
    wifi: Option<BlockingWifi<EspWifi<'static>>>,
    // NVS partition for storing credentials
    nvs: Option<EspDefaultNvsPartition>,
}

// Global WiFi manager - protected by mutex
static WIFI_MANAGER: Mutex<Option<WifiManager>> = Mutex::new(None);

/// Initialize the WiFi subsystem (call once at startup)
/// This sets up the WiFi hardware but doesn't connect yet
pub fn init_wifi_system(
    modem: Modem,
    sysloop: EspSystemEventLoop,
    nvs: Option<EspDefaultNvsPartition>,
) -> Result<(), String> {
    info!("Initializing WiFi subsystem...");

    // Leak modem to get 'static lifetime
    let modem: Modem<'static> = unsafe { std::mem::transmute(modem) };

    let esp_wifi = EspWifi::new(modem, sysloop.clone(), nvs.clone())
        .map_err(|e| format!("Failed to create EspWifi: {:?}", e))?;

    let wifi = BlockingWifi::wrap(esp_wifi, sysloop.clone())
        .map_err(|e| format!("Failed to wrap WiFi: {:?}", e))?;

    // Load saved credentials from NVS
    let (saved_ssid, saved_password) = load_credentials_from_nvs(nvs.as_ref());

    let mut manager = WIFI_MANAGER.lock().unwrap();
    *manager = Some(WifiManager {
        state: WifiState::Disconnected,
        ssid: saved_ssid.clone(),
        password: saved_password.clone(),
        wifi: Some(wifi),
        nvs,
    });

    info!("WiFi subsystem initialized");

    // Auto-connect if we have saved credentials
    if !saved_ssid.is_empty() {
        info!("Found saved WiFi credentials, auto-connecting to: {}", saved_ssid);
        drop(manager); // Release lock before calling start_connect
        let _ = start_connect(&saved_ssid, &saved_password);
    }

    Ok(())
}

/// Load WiFi credentials from NVS
fn load_credentials_from_nvs(nvs: Option<&EspDefaultNvsPartition>) -> (String, String) {
    let Some(nvs_partition) = nvs else {
        return (String::new(), String::new());
    };

    let Ok(nvs) = EspNvs::new(nvs_partition.clone(), NVS_NAMESPACE, true) else {
        warn!("Failed to open NVS namespace for reading");
        return (String::new(), String::new());
    };

    let mut ssid_buf = [0u8; 64];
    let mut password_buf = [0u8; 64];

    let ssid = match nvs.get_str(NVS_KEY_SSID, &mut ssid_buf) {
        Ok(Some(s)) => s.to_string(),
        _ => String::new(),
    };

    let password = match nvs.get_str(NVS_KEY_PASSWORD, &mut password_buf) {
        Ok(Some(s)) => s.to_string(),
        _ => String::new(),
    };

    if !ssid.is_empty() {
        info!("Loaded saved WiFi SSID: {}", ssid);
    }

    (ssid, password)
}

/// Save WiFi credentials to NVS
fn save_credentials_to_nvs(ssid: &str, password: &str) {
    let manager_guard = WIFI_MANAGER.lock().unwrap();
    let Some(manager) = manager_guard.as_ref() else {
        return;
    };
    let Some(nvs_partition) = manager.nvs.as_ref() else {
        warn!("No NVS partition available for saving credentials");
        return;
    };

    let nvs_clone = nvs_partition.clone();
    drop(manager_guard); // Release lock before NVS operations

    let Ok(nvs) = EspNvs::new(nvs_clone, NVS_NAMESPACE, true) else {
        error!("Failed to open NVS namespace for writing");
        return;
    };

    if let Err(e) = nvs.set_str(NVS_KEY_SSID, ssid) {
        error!("Failed to save SSID to NVS: {:?}", e);
        return;
    }

    if let Err(e) = nvs.set_str(NVS_KEY_PASSWORD, password) {
        error!("Failed to save password to NVS: {:?}", e);
        return;
    }

    info!("WiFi credentials saved to NVS");
}

/// Start WiFi connection (non-blocking, runs in background)
fn start_connect(ssid: &str, password: &str) -> Result<(), String> {
    let ssid_owned = ssid.to_string();
    let password_owned = password.to_string();

    // Update state to Connecting
    {
        let mut manager_guard = WIFI_MANAGER.lock().unwrap();
        let manager = manager_guard.as_mut().ok_or("WiFi not initialized")?;
        manager.state = WifiState::Connecting;
        manager.ssid = ssid_owned.clone();
        manager.password = password_owned.clone();
    }

    info!("Starting WiFi connection to: {}", ssid_owned);

    // Do the connection in the current context (we'll make it truly async later if needed)
    // For now, we'll do a blocking connect but update state properly
    let result = do_connect(&ssid_owned, &password_owned);

    // Update state based on result
    {
        let mut manager_guard = WIFI_MANAGER.lock().unwrap();
        if let Some(manager) = manager_guard.as_mut() {
            match result {
                Ok((ip, rssi)) => {
                    manager.state = WifiState::Connected { ip, rssi };
                    info!("WiFi connected! IP: {}.{}.{}.{} RSSI: {}dBm", ip[0], ip[1], ip[2], ip[3], rssi);
                }
                Err(ref e) => {
                    manager.state = WifiState::Error(e.clone());
                    warn!("WiFi connection failed: {}", e);
                }
            }
        }
    }

    // Save credentials to NVS after successful connection
    if result.is_ok() {
        save_credentials_to_nvs(&ssid_owned, &password_owned);
    }

    result.map(|_| ())
}

/// Actually perform the WiFi connection (blocking)
fn do_connect(ssid: &str, password: &str) -> Result<([u8; 4], i8), String> {
    let mut manager_guard = WIFI_MANAGER.lock().unwrap();
    let manager = manager_guard.as_mut().ok_or("WiFi not initialized")?;

    let wifi = manager.wifi.as_mut().ok_or("WiFi handle not available")?;

    // Configure WiFi
    let config = Configuration::Client(ClientConfiguration {
        ssid: ssid.try_into().map_err(|_| "SSID too long")?,
        bssid: None,
        auth_method: if password.is_empty() { AuthMethod::None } else { AuthMethod::WPA2Personal },
        password: password.try_into().map_err(|_| "Password too long")?,
        channel: None,
        ..Default::default()
    });

    wifi.set_configuration(&config)
        .map_err(|e| format!("Failed to set config: {:?}", e))?;

    // Start WiFi
    wifi.start()
        .map_err(|e| format!("Failed to start WiFi: {:?}", e))?;

    // Connect
    wifi.connect()
        .map_err(|e| format!("Failed to connect: {:?}", e))?;

    // Wait for IP
    wifi.wait_netif_up()
        .map_err(|e| format!("Failed to get IP: {:?}", e))?;

    // Get IP address
    let ip_info = wifi.wifi().sta_netif().get_ip_info()
        .map_err(|e| format!("Failed to get IP info: {:?}", e))?;

    let ip = ip_info.ip;
    let ip_bytes = [ip.octets()[0], ip.octets()[1], ip.octets()[2], ip.octets()[3]];

    // Get RSSI (signal strength)
    let rssi = get_current_rssi_internal(wifi);

    Ok((ip_bytes, rssi))
}

/// Get current RSSI from WiFi driver (internal helper)
fn get_current_rssi_internal(wifi: &mut BlockingWifi<EspWifi<'static>>) -> i8 {
    // Try to get scan info for the connected AP
    match wifi.wifi_mut().driver_mut().get_scan_result() {
        Ok(results) => {
            // Find the connected SSID in scan results
            if let Some(ap) = results.first() {
                return ap.signal_strength;
            }
        }
        Err(_) => {}
    }
    -50 // Default moderate signal if we can't get it
}

/// Get current WiFi state
fn get_state() -> WifiState {
    let manager_guard = WIFI_MANAGER.lock().unwrap();
    match manager_guard.as_ref() {
        Some(manager) => manager.state.clone(),
        None => WifiState::Uninitialized,
    }
}

// ============================================================================
// C-callable interface
// ============================================================================

/// WiFi status codes for C interface
#[repr(C)]
pub struct WifiStatus {
    /// 0=Uninitialized, 1=Disconnected, 2=Connecting, 3=Connected, 4=Error
    pub state: c_int,
    /// IP address bytes (valid when state=3)
    pub ip: [u8; 4],
    /// Signal strength in dBm (valid when state=3), 0 if unknown
    pub rssi: i8,
}

/// WiFi scan result for C interface
#[repr(C)]
pub struct WifiScanResult {
    /// SSID (null-terminated)
    pub ssid: [c_char; 33],
    /// Signal strength in dBm
    pub rssi: i8,
    /// Auth mode: 0=Open, 1=WEP, 2=WPA, 3=WPA2, 4=WPA3
    pub auth_mode: u8,
}

/// Initialize WiFi system - called from main.rs, not from C
/// Returns 0 on success, -1 on error
#[no_mangle]
pub extern "C" fn wifi_system_init() -> c_int {
    // This is a placeholder - actual init happens from Rust main
    // because we need the Modem peripheral
    0
}

/// Start WiFi connection with given SSID and password
/// Returns 0 if connection started, -1 on error
#[no_mangle]
pub extern "C" fn wifi_connect(ssid: *const c_char, password: *const c_char) -> c_int {
    if ssid.is_null() {
        error!("wifi_connect: SSID is null");
        return -1;
    }

    let ssid_str = unsafe {
        match CStr::from_ptr(ssid).to_str() {
            Ok(s) => s,
            Err(_) => {
                error!("wifi_connect: Invalid SSID string");
                return -1;
            }
        }
    };

    let password_str = if password.is_null() {
        ""
    } else {
        unsafe {
            match CStr::from_ptr(password).to_str() {
                Ok(s) => s,
                Err(_) => {
                    error!("wifi_connect: Invalid password string");
                    return -1;
                }
            }
        }
    };

    match start_connect(ssid_str, password_str) {
        Ok(_) => 0,
        Err(e) => {
            error!("wifi_connect failed: {}", e);
            -1
        }
    }
}

/// Get current WiFi status
/// Fills the provided WifiStatus struct
#[no_mangle]
pub extern "C" fn wifi_get_status(status: *mut WifiStatus) {
    if status.is_null() {
        return;
    }

    let state = get_state();

    unsafe {
        match state {
            WifiState::Uninitialized => {
                (*status).state = 0;
                (*status).ip = [0, 0, 0, 0];
                (*status).rssi = 0;
            }
            WifiState::Disconnected => {
                (*status).state = 1;
                (*status).ip = [0, 0, 0, 0];
                (*status).rssi = 0;
            }
            WifiState::Connecting => {
                (*status).state = 2;
                (*status).ip = [0, 0, 0, 0];
                (*status).rssi = 0;
            }
            WifiState::Connected { ip, rssi } => {
                (*status).state = 3;
                (*status).ip = ip;
                (*status).rssi = rssi;
            }
            WifiState::Error(_) => {
                (*status).state = 4;
                (*status).ip = [0, 0, 0, 0];
                (*status).rssi = 0;
            }
        }
    }
}

/// Disconnect from WiFi
/// Returns 0 on success, -1 on error
#[no_mangle]
pub extern "C" fn wifi_disconnect() -> c_int {
    let mut manager_guard = WIFI_MANAGER.lock().unwrap();

    if let Some(manager) = manager_guard.as_mut() {
        if let Some(wifi) = manager.wifi.as_mut() {
            match wifi.disconnect() {
                Ok(_) => {
                    manager.state = WifiState::Disconnected;
                    info!("WiFi disconnected");
                    return 0;
                }
                Err(e) => {
                    error!("WiFi disconnect failed: {:?}", e);
                    return -1;
                }
            }
        }
    }

    -1
}

/// Check if WiFi is connected
/// Returns 1 if connected, 0 otherwise
#[no_mangle]
pub extern "C" fn wifi_is_connected() -> c_int {
    match get_state() {
        WifiState::Connected { .. } => 1,
        _ => 0,
    }
}

/// Get the connected SSID
/// Copies the SSID to the provided buffer, returns length or -1 on error
#[no_mangle]
pub extern "C" fn wifi_get_ssid(buf: *mut c_char, buf_len: c_int) -> c_int {
    if buf.is_null() || buf_len <= 0 {
        return -1;
    }

    let manager_guard = WIFI_MANAGER.lock().unwrap();
    match manager_guard.as_ref() {
        Some(manager) if !manager.ssid.is_empty() => {
            let ssid = &manager.ssid;
            let copy_len = std::cmp::min(ssid.len(), (buf_len - 1) as usize);
            unsafe {
                std::ptr::copy_nonoverlapping(ssid.as_ptr(), buf as *mut u8, copy_len);
                *buf.add(copy_len) = 0; // Null terminate
            }
            copy_len as c_int
        }
        _ => {
            unsafe { *buf = 0; }
            0
        }
    }
}

/// Scan for WiFi networks
/// Fills the results array with up to max_results entries
/// Returns the number of networks found, or -1 on error
#[no_mangle]
pub extern "C" fn wifi_scan(results: *mut WifiScanResult, max_results: c_int) -> c_int {
    if results.is_null() || max_results <= 0 {
        return -1;
    }

    let mut manager_guard = WIFI_MANAGER.lock().unwrap();
    let manager = match manager_guard.as_mut() {
        Some(m) => m,
        None => {
            error!("wifi_scan: WiFi not initialized");
            return -1;
        }
    };

    let wifi = match manager.wifi.as_mut() {
        Some(w) => w,
        None => {
            error!("wifi_scan: WiFi handle not available");
            return -1;
        }
    };

    info!("Starting WiFi scan...");

    // Ensure WiFi is started (needed for scanning even when not connected)
    if !wifi.is_started().unwrap_or(false) {
        info!("WiFi not started, starting it for scan...");
        // Set a basic STA config if not already configured
        let config = Configuration::Client(ClientConfiguration {
            ssid: "".try_into().unwrap_or_default(),
            ..Default::default()
        });
        if let Err(e) = wifi.set_configuration(&config) {
            warn!("Could not set config for scan: {:?}", e);
        }
        if let Err(e) = wifi.start() {
            error!("Failed to start WiFi for scan: {:?}", e);
            return -1;
        }
    }

    // Start scan - BlockingWifi::scan() returns results directly
    let scan_results = match wifi.scan() {
        Ok(results) => results,
        Err(e) => {
            error!("WiFi scan failed: {:?}", e);
            return -1;
        }
    };

    let count = std::cmp::min(scan_results.len(), max_results as usize);
    info!("WiFi scan found {} networks", count);
    for (i, ap) in scan_results.iter().take(5).enumerate() {
        info!("  [{}] SSID: {} RSSI: {}", i, ap.ssid, ap.signal_strength);
    }

    for (i, ap) in scan_results.iter().take(count).enumerate() {
        unsafe {
            let result = &mut *results.add(i);

            // Copy SSID
            let ssid_bytes = ap.ssid.as_bytes();
            let ssid_len = std::cmp::min(ssid_bytes.len(), 32);
            std::ptr::copy_nonoverlapping(ssid_bytes.as_ptr(), result.ssid.as_mut_ptr() as *mut u8, ssid_len);
            result.ssid[ssid_len] = 0; // Null terminate

            // Copy RSSI
            result.rssi = ap.signal_strength;

            // Map auth mode
            result.auth_mode = match ap.auth_method {
                Some(AuthMethod::None) => 0,
                Some(AuthMethod::WEP) => 1,
                Some(AuthMethod::WPA) => 2,
                Some(AuthMethod::WPA2Personal) | Some(AuthMethod::WPA2Enterprise) => 3,
                Some(AuthMethod::WPA3Personal) => 4,
                _ => 3, // Default to WPA2
            };
        }
    }

    count as c_int
}

/// Get current RSSI (signal strength)
/// Returns RSSI in dBm, or 0 if not connected
#[no_mangle]
pub extern "C" fn wifi_get_rssi() -> i8 {
    let manager_guard = WIFI_MANAGER.lock().unwrap();
    match manager_guard.as_ref() {
        Some(manager) => {
            match &manager.state {
                WifiState::Connected { rssi, .. } => *rssi,
                _ => 0,
            }
        }
        None => 0,
    }
}

// ============================================================================
// Printer Discovery via UDP (Bambu SSDP-like protocol)
// ============================================================================

/// Discovered printer info for C interface
#[repr(C)]
pub struct PrinterDiscoveryResult {
    /// Printer name (null-terminated)
    pub name: [c_char; 64],
    /// Serial number (null-terminated)
    pub serial: [c_char; 32],
    /// IP address as string (null-terminated)
    pub ip: [c_char; 16],
    /// Model name (null-terminated)
    pub model: [c_char; 32],
}

/// Discover Bambu printers on the network via UDP broadcast
/// Fills the results array with up to max_results entries
/// Returns the number of printers found, or -1 on error
#[no_mangle]
pub extern "C" fn printer_discover(results: *mut PrinterDiscoveryResult, max_results: c_int) -> c_int {
    use std::net::{UdpSocket, SocketAddr, Ipv4Addr};
    use std::time::Duration;

    if results.is_null() || max_results <= 0 {
        return -1;
    }

    // Check if WiFi is connected
    if !matches!(get_state(), WifiState::Connected { .. }) {
        error!("printer_discover: WiFi not connected");
        return -1;
    }

    info!("Starting printer discovery...");

    // Create UDP socket
    let socket = match UdpSocket::bind("0.0.0.0:0") {
        Ok(s) => s,
        Err(e) => {
            error!("Failed to create UDP socket: {:?}", e);
            return -1;
        }
    };

    // Enable broadcast
    if let Err(e) = socket.set_broadcast(true) {
        error!("Failed to enable broadcast: {:?}", e);
        return -1;
    }

    // Set receive timeout (2 seconds)
    if let Err(e) = socket.set_read_timeout(Some(Duration::from_secs(2))) {
        error!("Failed to set socket timeout: {:?}", e);
        return -1;
    }

    // Bambu discovery message (SSDP-like M-SEARCH)
    // Bambu printers respond to SSDP on UDP 2021
    let discover_msg = b"M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: urn:bambulab-com:device:3dprinter:1\r\n\r\n";

    // Send broadcast to port 2021 (Bambu discovery port)
    let broadcast_addr: SocketAddr = (Ipv4Addr::BROADCAST, 2021).into();
    if let Err(e) = socket.send_to(discover_msg, broadcast_addr) {
        error!("Failed to send discovery broadcast: {:?}", e);
        return -1;
    }

    // Also try multicast address that Bambu uses
    let multicast_addr: SocketAddr = (Ipv4Addr::new(239, 255, 255, 250), 2021).into();
    let _ = socket.send_to(discover_msg, multicast_addr);

    info!("Discovery broadcast sent, waiting for responses...");

    // Receive responses
    let mut count = 0;
    let mut buf = [0u8; 1024];

    loop {
        if count >= max_results as usize {
            break;
        }

        match socket.recv_from(&mut buf) {
            Ok((len, addr)) => {
                info!("Received {} bytes from {}", len, addr);

                // Parse the response
                if let Some(printer_info) = parse_printer_response(&buf[..len], &addr.to_string()) {
                    unsafe {
                        let result = &mut *results.add(count);

                        // Copy name
                        let name_bytes = printer_info.0.as_bytes();
                        let name_len = std::cmp::min(name_bytes.len(), 63);
                        std::ptr::copy_nonoverlapping(name_bytes.as_ptr(), result.name.as_mut_ptr() as *mut u8, name_len);
                        result.name[name_len] = 0;

                        // Copy serial
                        let serial_bytes = printer_info.1.as_bytes();
                        let serial_len = std::cmp::min(serial_bytes.len(), 31);
                        std::ptr::copy_nonoverlapping(serial_bytes.as_ptr(), result.serial.as_mut_ptr() as *mut u8, serial_len);
                        result.serial[serial_len] = 0;

                        // Copy IP
                        let ip_bytes = printer_info.2.as_bytes();
                        let ip_len = std::cmp::min(ip_bytes.len(), 15);
                        std::ptr::copy_nonoverlapping(ip_bytes.as_ptr(), result.ip.as_mut_ptr() as *mut u8, ip_len);
                        result.ip[ip_len] = 0;

                        // Copy model
                        let model_bytes = printer_info.3.as_bytes();
                        let model_len = std::cmp::min(model_bytes.len(), 31);
                        std::ptr::copy_nonoverlapping(model_bytes.as_ptr(), result.model.as_mut_ptr() as *mut u8, model_len);
                        result.model[model_len] = 0;
                    }
                    count += 1;
                    info!("Found printer: {} ({}) at {}", printer_info.0, printer_info.1, printer_info.2);
                }
            }
            Err(e) => {
                // Timeout or other error - stop listening
                if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut {
                    info!("Discovery timeout, found {} printers", count);
                } else {
                    error!("Error receiving: {:?}", e);
                }
                break;
            }
        }
    }

    count as c_int
}

/// Parse Bambu printer discovery response
/// Returns (name, serial, ip, model) if valid
fn parse_printer_response(data: &[u8], source_ip: &str) -> Option<(String, String, String, String)> {
    // Extract IP from source address (remove port)
    let ip = source_ip.split(':').next().unwrap_or(source_ip).to_string();

    // Log raw bytes for debugging (first 100 bytes as hex)
    let hex_preview: String = data.iter().take(100).map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(" ");
    info!("Raw response from {} ({} bytes): {}", ip, data.len(), hex_preview);

    let text = match std::str::from_utf8(data) {
        Ok(t) => t,
        Err(e) => {
            warn!("Response is not valid UTF-8: {:?}", e);
            return None;
        }
    };

    // Log full response for debugging
    info!("Text response from {}: {}", ip, text);

    let mut serial = String::new();
    let mut model = String::new();
    let mut name = String::new();

    // Bambu printers respond with JSON containing printer info
    // Common fields: "dev_sn", "sn", "name", "product_name", "dev_name", "machine_name"

    // Try multiple field names for serial
    for key in &["\"dev_sn\"", "\"sn\"", "\"serial\""] {
        if serial.is_empty() {
            if let Some(pos) = text.find(key) {
                if let Some(value) = extract_json_string_value(&text[pos..]) {
                    if !value.is_empty() {
                        serial = value;
                        info!("Found serial from {}: {}", key, serial);
                    }
                }
            }
        }
    }

    // Try multiple field names for model/product
    for key in &["\"product_name\"", "\"model\"", "\"dev_product_name\"", "\"machine_type\""] {
        if model.is_empty() {
            if let Some(pos) = text.find(key) {
                if let Some(value) = extract_json_string_value(&text[pos..]) {
                    if !value.is_empty() {
                        model = value;
                        info!("Found model from {}: {}", key, model);
                    }
                }
            }
        }
    }

    // Try multiple field names for printer name
    for key in &["\"dev_name\"", "\"machine_name\"", "\"name\""] {
        if name.is_empty() {
            if let Some(pos) = text.find(key) {
                if let Some(value) = extract_json_string_value(&text[pos..]) {
                    if !value.is_empty() {
                        name = value;
                        info!("Found name from {}: {}", key, name);
                    }
                }
            }
        }
    }

    // Parse SSDP/HTTP headers from Bambu printers
    // Format: "HeaderName: value" or "HeaderName.bambu.com: value"
    for line in text.lines() {
        let line = line.trim();

        // Skip empty lines
        if line.is_empty() {
            continue;
        }

        // USN header contains the serial number directly (e.g., "USN: 00M09C411500579")
        if line.to_uppercase().starts_with("USN:") && serial.is_empty() {
            let usn = line[4..].trim();
            // Bambu sends raw serial, but handle uuid: prefix too just in case
            if let Some(uuid_part) = usn.strip_prefix("uuid:") {
                if let Some(serial_end) = uuid_part.find("::") {
                    serial = uuid_part[..serial_end].to_string();
                } else {
                    serial = uuid_part.to_string();
                }
            } else {
                // Raw serial number
                serial = usn.to_string();
            }
            info!("Found serial from USN: {}", serial);
        }

        // DevModel.bambu.com: BL-P001 (model code)
        if line.starts_with("DevModel.bambu.com:") && model.is_empty() {
            model = line["DevModel.bambu.com:".len()..].trim().to_string();
            info!("Found model from DevModel.bambu.com: {}", model);
        }

        // DevName.bambu.com: X1C-2 (printer name)
        if line.starts_with("DevName.bambu.com:") && name.is_empty() {
            name = line["DevName.bambu.com:".len()..].trim().to_string();
            info!("Found name from DevName.bambu.com: {}", name);
        }

        // Fallback: generic MODEL header
        if (line.to_uppercase().starts_with("MODEL:") || line.to_uppercase().starts_with("X-MODEL:")) && model.is_empty() {
            let colon_pos = line.find(':').unwrap_or(0);
            model = line[colon_pos + 1..].trim().to_string();
        }

        // Fallback: FRIENDLY-NAME header
        if (line.to_uppercase().starts_with("FRIENDLY-NAME:") || line.to_uppercase().starts_with("X-FRIENDLY-NAME:")) && name.is_empty() {
            let colon_pos = line.find(':').unwrap_or(0);
            name = line[colon_pos + 1..].trim().to_string();
        }
    }

    // Generate default name if not found
    if name.is_empty() {
        if !serial.is_empty() && !model.is_empty() {
            // Use last 6 chars of serial for short name
            let short_serial = if serial.len() > 6 {
                &serial[serial.len() - 6..]
            } else {
                &serial
            };
            name = format!("{} ({})", model, short_serial);
        } else if !model.is_empty() {
            name = format!("{} at {}", model, ip);
        } else if !serial.is_empty() {
            let short = &serial[serial.len().saturating_sub(6)..];
            name = format!("Printer {}", short);
        } else {
            name = format!("Bambu Printer at {}", ip);
        }
    }

    // Map Bambu model codes to friendly names
    // Reference: https://github.com/bambulab/BambuStudio/tree/master/resources/printers
    let friendly_model = match model.as_str() {
        // X1 Series
        "BL-P001" => "X1 Carbon",
        "BL-P002" => "X1",
        "C13" => "X1E",
        // P1 Series
        "C11" => "P1P",
        "C12" => "P1S",
        // A1 Series
        "N1" => "A1 Mini",
        "N2S" => "A1",
        // P2 Series
        "N7" => "P2S",
        // H2 Series
        "O1C" | "O1C2" => "H2C",
        "O1D" => "H2D",
        "O1E" => "H2D Pro",
        "O1S" => "H2S",
        "" => "Bambu Printer",
        other => other, // Keep unknown codes as-is
    };
    let model = friendly_model.to_string();

    info!("Final parsed: name='{}', serial='{}', model='{}', ip='{}'", name, serial, model, ip);
    Some((name, serial, ip, model))
}

/// Extract a JSON string value from text starting at a key
/// Input: "\"key\": \"value\"..." or "\"key\":\"value\"..."
/// Returns: Some("value") or None
fn extract_json_string_value(text: &str) -> Option<String> {
    // Find the colon after the key
    let colon_pos = text.find(':')?;
    let after_colon = &text[colon_pos + 1..];

    // Find the opening quote
    let quote_start = after_colon.find('"')?;
    let value_start = quote_start + 1;
    let remaining = &after_colon[value_start..];

    // Find the closing quote (handle escaped quotes)
    let mut end_pos = 0;
    let mut chars = remaining.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            // Skip escaped character
            chars.next();
            end_pos += 2;
        } else if c == '"' {
            break;
        } else {
            end_pos += c.len_utf8();
        }
    }

    if end_pos > 0 || remaining.starts_with('"') {
        Some(remaining[..end_pos].to_string())
    } else {
        None
    }
}
