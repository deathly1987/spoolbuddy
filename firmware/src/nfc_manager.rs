//! NFC Manager with C-callable interface
//!
//! Provides FFI functions for the C UI code to access NFC data.
//! Manages the PN5180 driver and handles card detection/reading.

use esp_idf_hal::gpio::{Input, Output, PinDriver};
use embedded_hal::spi::SpiDevice;
use log::{info, warn};
use std::sync::Mutex;

use crate::nfc::pn5180::{self, Iso14443aCard, Pn5180Driver, Pn5180Error, Pn5180State};

/// Global NFC state protected by mutex
static NFC_STATE: Mutex<Option<NfcManagerState>> = Mutex::new(None);

/// NFC manager state (without driver - driver is type-erased)
struct NfcManagerState {
    /// PN5180 state
    state: Pn5180State,
    /// Last detected card info
    last_card: Option<CardInfo>,
    /// Whether RF field is on
    rf_on: bool,
    /// Card present flag
    card_present: bool,
    /// Poll counter
    poll_count: u32,
}

/// Card information for FFI
#[repr(C)]
#[derive(Debug, Clone)]
pub struct CardInfo {
    /// UID bytes (up to 10)
    pub uid: [u8; 10],
    /// UID length (4, 7, or 10)
    pub uid_len: u8,
    /// ATQA bytes
    pub atqa: [u8; 2],
    /// SAK byte
    pub sak: u8,
    /// Card type (0=unknown, 1=NTAG, 2=MIFARE Classic 1K, 3=MIFARE Classic 4K)
    pub card_type: u8,
}

impl From<&Iso14443aCard> for CardInfo {
    fn from(card: &Iso14443aCard) -> Self {
        let card_type = if card.is_ntag() {
            1
        } else if card.is_mifare_classic_1k() {
            2
        } else if card.is_mifare_classic_4k() {
            3
        } else {
            0
        };

        CardInfo {
            uid: card.uid,
            uid_len: card.uid_len,
            atqa: card.atqa,
            sak: card.sak,
            card_type,
        }
    }
}

/// NFC status for C code
#[repr(C)]
pub struct NfcStatus {
    pub initialized: bool,
    pub rf_on: bool,
    pub card_present: bool,
    pub firmware_major: u8,
    pub firmware_minor: u8,
    pub firmware_patch: u8,
}

/// Initialize the NFC manager (called after driver init)
pub fn init_nfc_manager(state: Pn5180State) {
    let mut guard = NFC_STATE.lock().unwrap();
    *guard = Some(NfcManagerState {
        state,
        last_card: None,
        rf_on: false,
        card_present: false,
        poll_count: 0,
    });
    info!("NFC manager initialized");
}

/// Store driver reference for polling
/// Note: We use a separate static for the driver due to type complexity
static NFC_DRIVER: Mutex<Option<NfcDriverHolder>> = Mutex::new(None);

/// Type-erased driver holder
/// Note: Not Send because driver uses raw pointers internally
struct NfcDriverHolder {
    /// Function pointer to poll for cards
    poll_fn: Box<dyn FnMut() -> Result<Option<Iso14443aCard>, Pn5180Error>>,
    /// Function pointer to turn RF on
    rf_on_fn: Box<dyn FnMut() -> Result<(), Pn5180Error>>,
    /// Function pointer to turn RF off
    rf_off_fn: Box<dyn FnMut() -> Result<(), Pn5180Error>>,
}

/// Initialize NFC driver holder with the actual driver
pub fn init_nfc_driver<'a, SPI>(
    mut driver: Pn5180Driver<'a, SPI>,
) where
    SPI: SpiDevice + Send + 'static,
{
    // We need to leak the driver to get 'static lifetime
    let driver = Box::leak(Box::new(driver));

    // Create closures that capture the driver
    let driver_ptr = driver as *mut Pn5180Driver<'static, SPI>;

    let poll_fn = Box::new(move || {
        let driver = unsafe { &mut *driver_ptr };
        driver.iso14443a_activate()
    });

    let driver_ptr2 = driver_ptr;
    let rf_on_fn = Box::new(move || {
        let driver = unsafe { &mut *driver_ptr2 };
        driver.rf_on()
    });

    let driver_ptr3 = driver_ptr;
    let rf_off_fn = Box::new(move || {
        let driver = unsafe { &mut *driver_ptr3 };
        driver.rf_off()
    });

    let mut guard = NFC_DRIVER.lock().unwrap();
    *guard = Some(NfcDriverHolder {
        poll_fn,
        rf_on_fn,
        rf_off_fn,
    });

    info!("NFC driver holder initialized");
}

/// Poll for NFC cards (call from main loop)
pub fn poll_nfc() {
    let mut driver_guard = NFC_DRIVER.lock().unwrap();
    let mut state_guard = NFC_STATE.lock().unwrap();

    if let (Some(ref mut driver), Some(ref mut state)) = (&mut *driver_guard, &mut *state_guard) {
        state.poll_count += 1;

        // Only poll every 10th call to reduce overhead
        if state.poll_count % 10 != 0 {
            return;
        }

        // Ensure RF is on
        if !state.rf_on {
            match (driver.rf_on_fn)() {
                Ok(()) => {
                    state.rf_on = true;
                    info!("NFC RF field enabled");
                }
                Err(e) => {
                    warn!("Failed to enable RF field: {:?}", e);
                    return;
                }
            }
        }

        // Try to detect a card
        match (driver.poll_fn)() {
            Ok(Some(card)) => {
                if !state.card_present {
                    info!("NFC card detected! ATQA: {:02X}{:02X}, SAK: {:02X}",
                          card.atqa[0], card.atqa[1], card.sak);
                    if card.uid_len > 0 {
                        let uid_str: String = card.uid[..card.uid_len as usize]
                            .iter()
                            .map(|b| format!("{:02X}", b))
                            .collect::<Vec<_>>()
                            .join(":");
                        info!("  UID: {}", uid_str);
                    }
                }
                state.card_present = true;
                state.last_card = Some(CardInfo::from(&card));
            }
            Ok(None) => {
                if state.card_present {
                    info!("NFC card removed");
                }
                state.card_present = false;
            }
            Err(e) => {
                // Timeout is normal when no card present
                if !matches!(e, Pn5180Error::Timeout) {
                    warn!("NFC poll error: {:?}", e);
                }
                state.card_present = false;
            }
        }
    }
}

// =============================================================================
// C-callable FFI functions
// =============================================================================

/// Get NFC status
#[no_mangle]
pub extern "C" fn nfc_get_status(status: *mut NfcStatus) {
    if status.is_null() {
        return;
    }

    let guard = NFC_STATE.lock().unwrap();
    let status = unsafe { &mut *status };

    if let Some(ref manager) = *guard {
        status.initialized = manager.state.initialized;
        status.rf_on = manager.rf_on;
        status.card_present = manager.card_present;
        status.firmware_major = manager.state.firmware_version.0;
        status.firmware_minor = manager.state.firmware_version.1;
        status.firmware_patch = manager.state.firmware_version.2;
    } else {
        status.initialized = false;
        status.rf_on = false;
        status.card_present = false;
        status.firmware_major = 0;
        status.firmware_minor = 0;
        status.firmware_patch = 0;
    }
}

/// Check if NFC is initialized
#[no_mangle]
pub extern "C" fn nfc_is_initialized() -> bool {
    let guard = NFC_STATE.lock().unwrap();
    if let Some(ref manager) = *guard {
        manager.state.initialized
    } else {
        false
    }
}

/// Check if a card is present
#[no_mangle]
pub extern "C" fn nfc_card_present() -> bool {
    let guard = NFC_STATE.lock().unwrap();
    if let Some(ref manager) = *guard {
        manager.card_present
    } else {
        false
    }
}

/// Get last detected card info
/// Returns true if card info is available, false otherwise
#[no_mangle]
pub extern "C" fn nfc_get_card_info(info: *mut CardInfo) -> bool {
    if info.is_null() {
        return false;
    }

    let guard = NFC_STATE.lock().unwrap();
    if let Some(ref manager) = *guard {
        if let Some(ref card) = manager.last_card {
            unsafe {
                *info = card.clone();
            }
            return true;
        }
    }
    false
}

/// Get card UID as hex string (returns length, 0 if no card)
#[no_mangle]
pub extern "C" fn nfc_get_uid_hex(buf: *mut u8, buf_len: usize) -> usize {
    if buf.is_null() || buf_len < 3 {
        return 0;
    }

    let guard = NFC_STATE.lock().unwrap();
    if let Some(ref manager) = *guard {
        if let Some(ref card) = manager.last_card {
            let uid_len = card.uid_len as usize;
            // Each byte becomes 2 hex chars + colons between
            let needed = uid_len * 2 + uid_len.saturating_sub(1);
            if needed > buf_len {
                return 0;
            }

            let mut pos = 0;
            for (i, byte) in card.uid[..uid_len].iter().enumerate() {
                if i > 0 {
                    unsafe { *buf.add(pos) = b':'; }
                    pos += 1;
                }
                let hex = format!("{:02X}", byte);
                unsafe {
                    *buf.add(pos) = hex.as_bytes()[0];
                    *buf.add(pos + 1) = hex.as_bytes()[1];
                }
                pos += 2;
            }
            return pos;
        }
    }
    0
}

/// Get firmware version string
#[no_mangle]
pub extern "C" fn nfc_get_firmware_version(major: *mut u8, minor: *mut u8, patch: *mut u8) {
    let guard = NFC_STATE.lock().unwrap();
    if let Some(ref manager) = *guard {
        if !major.is_null() {
            unsafe { *major = manager.state.firmware_version.0; }
        }
        if !minor.is_null() {
            unsafe { *minor = manager.state.firmware_version.1; }
        }
        if !patch.is_null() {
            unsafe { *patch = manager.state.firmware_version.2; }
        }
    }
}
